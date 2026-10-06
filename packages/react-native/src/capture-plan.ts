import type { ChallengeState } from '@bipdelivery/core';

/**
 * Which evidence to capture when the challenge machine moves.
 *
 *   movement  The prompted movement was just satisfied. The head is still
 *             travelling past the threshold, so this is where the frames that
 *             prove the movement must come from — several, see
 *             FRAMES_PER_MOVEMENT.
 *   neutral   The applicant came back to centre. The server needs this frame
 *             to rule out a photo held at a fixed angle: a real head is seen
 *             both turned AND facing forward.
 *
 * The frames are what kyc-mz judges. The on-device machine only coaches and
 * decides when to capture, so capturing at the wrong moment — a "turn left"
 * frame taken after the head came back — rejects an applicant who did the
 * movement, which is how this rule was found.
 */
export type CaptureRequest = 'movement' | 'neutral' | null;

export function captureFor(previous: ChallengeState, next: ChallengeState): CaptureRequest {
  if (previous === next) return null;
  if (previous.phase === 'awaiting_action' && next.phase === 'returning') return 'movement';
  if (previous.phase === 'returning' && next.phase !== 'returning') return 'neutral';
  return null;
}

/**
 * Frames per movement, and the gap between them.
 *
 * One still gives one attempt at a window of roughly a second, and loses it to
 * motion blur or capture latency often enough to reject people who performed
 * the movement. Two, 300 ms apart, both land inside the window and keep the
 * upload under the server's 12-frame cap for a two-action challenge.
 */
export const FRAMES_PER_MOVEMENT = 2;
export const FOLLOW_UP_FRAME_MS = 300;

/** The most frames kyc-mz accepts with one selfie (MAX_CHALLENGE_FRAMES). */
export const MAX_FRAMES = 12;
