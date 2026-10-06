import type { Matrix } from '@mediapipe/tasks-vision';
import type { Pose } from '@bipdelivery/core';

/**
 * Head pose from MediaPipe's facial transformation matrix.
 *
 * FaceLandmarker with `outputFacialTransformationMatrixes` returns a 4x4 rigid
 * transform taking the canonical face model onto the detected face. Its
 * rotation block is therefore the head's orientation, and Euler angles fall out
 * of it — but WHICH angles depends on decomposition order and on sign
 * conventions that nothing in the pipeline guarantees.
 *
 * That matters more here than it looks. The challenge machine's ACTION_AXIS is
 * a contract: +yaw means the head turned to the applicant's own left, +pitch
 * means the chin lifted. kyc-mz re-derives pose from the uploaded frames with
 * insightface and applies the same rule. If this file's signs disagree with
 * either, "turn left" passes in the browser and fails on the server, and the
 * applicant sees a random rejection.
 *
 * So the extraction is written to be verifiable rather than plausible: see
 * pose.spec.ts, which builds rotation matrices for known angles and asserts
 * this returns them. The math is proven there; only the CAMERA-facing sign
 * (below) needs a human with a webcam.
 */

/**
 * MediaPipe's matrix is row-major in `data`, so index (r, c) is data[r*4 + c].
 *
 * Asserting this rather than assuming it: a column-major read of a rotation
 * matrix is its transpose, which is the INVERSE rotation — every angle comes
 * out negated, and the failure looks like a calibration problem rather than an
 * indexing one.
 */
const at = (m: Matrix, row: number, col: number): number =>
  m.data[row * m.columns + col];

/**
 * Whether the video is mirrored on screen.
 *
 * A front camera preview is conventionally flipped so the applicant sees
 * themselves as in a mirror — which reverses the apparent direction of every
 * horizontal movement. The prompt says "turn left" and the applicant turns what
 * is left TO THEM, so with a mirrored preview the raw yaw sign must be flipped
 * to match the machine's contract.
 *
 * Exposed as a parameter rather than hardcoded because it is a property of how
 * the caller renders the video, not of the detector.
 */
export interface PoseOptions {
  mirrored?: boolean;
}

/**
 * Euler angles in degrees from the 4x4 transform, or null when the matrix is
 * not the 4x4 rigid transform we expect.
 *
 * Decomposed as intrinsic Y-X-Z (yaw, then pitch, then roll), which is the
 * order that keeps yaw and pitch independent for the small-to-moderate head
 * movements a liveness challenge asks for. Roll is returned because a face
 * tilted sideways is a useful quality signal, even though no action uses it.
 */
export function poseFromMatrix(
  matrix: Matrix | undefined,
  { mirrored = true }: PoseOptions = {},
): (Pose & { roll: number }) | null {
  if (!matrix || matrix.rows !== 4 || matrix.columns !== 4) return null;
  if (matrix.data.length < 16) return null;

  // Rotation block of the rigid transform.
  const r00 = at(matrix, 0, 0);
  const r01 = at(matrix, 0, 1);
  const r02 = at(matrix, 0, 2);
  const r10 = at(matrix, 1, 0);
  const r11 = at(matrix, 1, 1);
  const r12 = at(matrix, 1, 2);
  const r22 = at(matrix, 2, 2);

  // Clamped because floating-point drift can push this a hair outside [-1, 1],
  // and asin of 1.0000001 is NaN — which would surface as a face that
  // intermittently stops being detected.
  const sinPitch = Math.max(-1, Math.min(1, -r12));
  const pitch = Math.asin(sinPitch);

  let yaw: number;
  let roll: number;

  // Gimbal lock: looking straight up or down makes yaw and roll the same
  // rotation, so they cannot be separated. Attribute it all to roll and let yaw
  // read zero — at that pitch no yaw action is being performed anyway.
  if (Math.abs(sinPitch) > 0.9999) {
    yaw = 0;
    roll = Math.atan2(-r01, r00);
  } else {
    yaw = Math.atan2(r02, r22);
    // Row 1, not row 0. For R = Ry·Rx·Rz the middle row is [cx·sz, cx·cz, -sx],
    // so this ratio is tan(roll) with the yaw terms already cancelled. Reading
    // row 0 instead mixes yaw into roll — which the combined-rotation test
    // catches and a single-axis test never would.
    roll = Math.atan2(r10, r11);
  }

  const deg = (radians: number) => (radians * 180) / Math.PI;

  return {
    yaw: deg(yaw) * (mirrored ? -1 : 1),
    pitch: deg(pitch),
    roll: deg(roll),
  };
}
