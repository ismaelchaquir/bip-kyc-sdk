import type { Pose } from '@bipdelivery/core';
import type { FaceFraming } from './use-face-pose';

/**
 * Whether a frame is good enough to be the portrait the whole verification is
 * matched on.
 *
 * This frame becomes the selfie: face match embeds it against the document, and
 * passive liveness scores it. Both were previously handed whatever the challenge
 * happened to leave behind — a head caught mid-turn, often blurred by the motion
 * that made it interesting. Observed face-match scores ran 0.51 to 0.68 against
 * a 0.50 threshold, and one run failed outright with no detectable face at all,
 * after the applicant had already completed both movements.
 *
 * Everything here is checked BEFORE the challenge starts, so a bad capture costs
 * two seconds instead of a whole run.
 */

/** How far off centre the head may be, per axis. Tighter than the challenge's
 *  neutral band: this is a posed portrait, not a pose caught in passing. */
export const PORTRAIT_YAW_DEG = 8;
export const PORTRAIT_PITCH_DEG = 8;

/**
 * Minimum face width as a fraction of the frame.
 *
 * A face much smaller than this gives the recogniser too few pixels to embed
 * well, which is one way a genuine applicant scores badly against their own
 * document.
 */
export const MIN_FACE_SPAN = 0.22;

/** Beyond this the face is drifting out of frame and may be clipped. */
export const MAX_FACE_OFFSET = 0.45;

/**
 * Laplacian variance below which the frame is too soft to use.
 *
 * Calibrated to face crops, not documents: measured over 14 genuine captures
 * the variance ran 27.7 to 99.7, and the blurred ones were the frames grabbed
 * while the head was still moving. This is measured on the whole frame rather
 * than a crop, so it sits low deliberately — it is here to reject obvious
 * motion blur, not to grade sharpness.
 */
export const MIN_SHARPNESS = 12;

export type PortraitProblem =
  | 'no_face'
  | 'too_far'
  | 'off_centre'
  | 'not_straight'
  | 'too_blurry';

export interface PortraitAssessment {
  ok: boolean;
  problem?: PortraitProblem;
}

/**
 * Ordered by what the applicant should fix first.
 *
 * Telling someone to hold still while their face is out of frame is noise; the
 * order here is the order the problems actually block each other in.
 */
export function assessPortrait(
  pose: Pose | null,
  framing: FaceFraming | null,
  sharpness: number | null,
): PortraitAssessment {
  if (!pose || !framing) return { ok: false, problem: 'no_face' };

  if (framing.faceSpan < MIN_FACE_SPAN) return { ok: false, problem: 'too_far' };

  if (
    framing.offsetX > MAX_FACE_OFFSET ||
    framing.offsetY > MAX_FACE_OFFSET
  ) {
    return { ok: false, problem: 'off_centre' };
  }

  if (
    Math.abs(pose.yaw) > PORTRAIT_YAW_DEG ||
    Math.abs(pose.pitch) > PORTRAIT_PITCH_DEG
  ) {
    return { ok: false, problem: 'not_straight' };
  }

  // Null means we did not measure this frame, which is not a reason to reject
  // it — sharpness is sampled on a slower cadence than the pose.
  if (sharpness !== null && sharpness < MIN_SHARPNESS) {
    return { ok: false, problem: 'too_blurry' };
  }

  return { ok: true };
}

/** What to tell the applicant, in their own terms rather than the check's. */
export const PORTRAIT_GUIDANCE: Record<PortraitProblem, string> = {
  no_face: 'Bring your face into the frame',
  too_far: 'Move a little closer',
  off_centre: 'Centre your face in the frame',
  not_straight: 'Look straight at the camera',
  too_blurry: 'Hold still',
};

/**
 * Variance of the Laplacian over a downscaled greyscale copy.
 *
 * Downscaled because this runs on a phone between animation frames and the
 * full frame is 720x1280; the measure is scale-sensitive in absolute terms,
 * which is why MIN_SHARPNESS is calibrated at this size rather than in the
 * abstract.
 */
export const SHARPNESS_SAMPLE_WIDTH = 240;

export function sharpnessOf(image: ImageData): number {
  const { width, height, data } = image;
  const grey = new Float64Array(width * height);

  for (let i = 0; i < grey.length; i++) {
    const p = i * 4;
    grey[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  let sum = 0;
  let sumSquares = 0;
  let count = 0;

  // Four-neighbour Laplacian, skipping the border where it is undefined.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value =
        grey[i - 1] + grey[i + 1] + grey[i - width] + grey[i + width] -
        4 * grey[i];
      sum += value;
      sumSquares += value * value;
      count++;
    }
  }

  if (count === 0) return 0;

  const mean = sum / count;
  return sumSquares / count - mean * mean;
}
