import { describe, expect, it } from 'vitest';
import type { Matrix } from '@mediapipe/tasks-vision';
import { poseFromMatrix } from './pose';

/**
 * Rotation matrices built from known angles, so the extraction is checked
 * against ground truth rather than against itself.
 *
 * Composed intrinsic Y-X-Z (yaw, pitch, roll) — the order poseFromMatrix
 * decomposes — and laid out ROW-MAJOR, which is how MediaPipe fills `data`.
 * If that assumption is wrong these tests fail, which is the point: a
 * column-major read is the transpose, i.e. the inverse rotation, and every
 * angle would come back negated.
 */
function transform(yawDeg: number, pitchDeg: number, rollDeg: number): Matrix {
  const rad = (d: number) => (d * Math.PI) / 180;
  const [cy, sy] = [Math.cos(rad(yawDeg)), Math.sin(rad(yawDeg))];
  const [cx, sx] = [Math.cos(rad(pitchDeg)), Math.sin(rad(pitchDeg))];
  const [cz, sz] = [Math.cos(rad(rollDeg)), Math.sin(rad(rollDeg))];

  // R = Ry * Rx * Rz
  const r = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];

  return {
    rows: 4,
    columns: 4,
    data: [
      r[0][0], r[0][1], r[0][2], 0,
      r[1][0], r[1][1], r[1][2], 0,
      r[2][0], r[2][1], r[2][2], 0,
      0, 0, 0, 1,
    ],
  };
}

/** Unmirrored, so the raw extraction is under test rather than the flip. */
const raw = (m: Matrix) => poseFromMatrix(m, { mirrored: false })!;

describe('poseFromMatrix', () => {
  it('recovers a neutral head as all zeros', () => {
    const pose = raw(transform(0, 0, 0));
    expect(pose.yaw).toBeCloseTo(0, 4);
    expect(pose.pitch).toBeCloseTo(0, 4);
    expect(pose.roll).toBeCloseTo(0, 4);
  });

  it('recovers yaw', () => {
    expect(raw(transform(30, 0, 0)).yaw).toBeCloseTo(30, 3);
    expect(raw(transform(-30, 0, 0)).yaw).toBeCloseTo(-30, 3);
  });

  it('recovers pitch', () => {
    expect(raw(transform(0, 25, 0)).pitch).toBeCloseTo(25, 3);
    expect(raw(transform(0, -25, 0)).pitch).toBeCloseTo(-25, 3);
  });

  it('recovers roll', () => {
    expect(raw(transform(0, 0, 15)).roll).toBeCloseTo(15, 3);
  });

  // The axes must stay separable, or a big yaw would leak into pitch and
  // satisfy "look up" while the applicant only turned their head.
  it('keeps the axes independent when combined', () => {
    const pose = raw(transform(28, 20, 10));
    expect(pose.yaw).toBeCloseTo(28, 3);
    expect(pose.pitch).toBeCloseTo(20, 3);
    expect(pose.roll).toBeCloseTo(10, 3);
  });

  it('does not leak yaw into pitch', () => {
    expect(raw(transform(40, 0, 0)).pitch).toBeCloseTo(0, 3);
  });

  /**
   * A mirrored preview reverses horizontal movement, so the applicant turning
   * to their own left produces the opposite raw yaw. Pitch is unaffected — a
   * mirror does not flip up and down.
   */
  it('flips yaw for a mirrored preview, and only yaw', () => {
    const m = transform(30, 20, 0);
    const mirroredPose = poseFromMatrix(m, { mirrored: true })!;

    expect(mirroredPose.yaw).toBeCloseTo(-30, 3);
    expect(mirroredPose.pitch).toBeCloseTo(20, 3);
  });

  it('mirrors by default, because a front-camera preview is mirrored', () => {
    expect(poseFromMatrix(transform(30, 0, 0))!.yaw).toBeCloseTo(-30, 3);
  });

  // Gimbal lock: at ±90° pitch, yaw and roll are the same rotation. Returning
  // NaN here would read downstream as "no face", intermittently.
  it('survives straight up without producing NaN', () => {
    const pose = raw(transform(0, 90, 0));
    expect(Number.isNaN(pose.yaw)).toBe(false);
    expect(Number.isNaN(pose.roll)).toBe(false);
    expect(pose.pitch).toBeCloseTo(90, 3);
  });

  it('rejects anything that is not a 4x4 transform', () => {
    expect(poseFromMatrix(undefined)).toBeNull();
    expect(poseFromMatrix({ rows: 3, columns: 3, data: new Array(9).fill(0) })).toBeNull();
    expect(poseFromMatrix({ rows: 4, columns: 4, data: [1, 0, 0] })).toBeNull();
  });
});
