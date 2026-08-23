import type { LivenessAction } from '../index';

/**
 * Pure state machine driving the active-liveness challenge.
 *
 * Kept free of React, of the camera, and of any platform API: the driver app
 * feeds it poses from ML Kit, the web SDK feeds it poses derived from
 * MediaPipe, and neither can tell the difference. That is the point of it
 * living in core — the two clients are judged by the SAME server, so a
 * threshold that differs between them means one of them tells applicants they
 * passed and the server disagrees.
 *
 * The machine's verdict is *advisory*. kyc-mz re-derives head pose from the
 * uploaded frames and decides for itself, because anything decided on the
 * client can be patched out — of an APK, or of a JS bundle, where it is very
 * much easier. What the machine is really for is coaching the applicant
 * through the movements and choosing which frames to send.
 */

/**
 * Degrees of deviation required to count an action as performed, per axis.
 *
 * Deliberately stricter than the server's thresholds (18 yaw / 12 pitch). If
 * the client were the more lenient of the two, applicants would be told they
 * passed and then be rejected server-side — the worst possible failure mode.
 * The 6° margin absorbs the difference between ML Kit's and insightface's pose
 * estimates for the same head position.
 *
 * Pitch is held to a lower bar than yaw because the two axes are not equally
 * easy to produce: device traces show an applicant reaching 40°+ of yaw without
 * effort while a deliberate head tilt peaks around 30°, so a shared threshold
 * fails "look up" on people who performed it perfectly well.
 */
export const YAW_ACTION_THRESHOLD_DEG = 24;
export const PITCH_ACTION_THRESHOLD_DEG = 18;

/** Below this on both axes counts as facing the camera. */
export const NEUTRAL_THRESHOLD_DEG = 12;

/**
 * Per-action budget. Past this the challenge fails and the applicant retries.
 *
 * Generous on purpose: the clock only starts once the applicant is centred, and
 * someone who overshoots on their first attempt needs time to come back and
 * try the movement again rather than being failed mid-correction.
 */
export const ACTION_TIMEOUT_MS = 10000;

/**
 * Sign convention mapping an action to the pose axis and direction to expect.
 *
 * IMPORTANT — the SIGNS here are a contract every pose source must meet, and
 * each one must be calibrated against a real camera before shipping.
 *
 * ML Kit (driver app), MediaPipe (web SDK) and insightface (server) make no
 * promise of agreeing on which way is positive, and a front camera's mirroring
 * flips yaw again on top of that. Getting it backwards makes "turn left" pass
 * on the client and fail on the server, which reads to the applicant as a
 * random rejection — the worst failure mode available, because it looks like
 * the product is broken rather than like they did the wrong thing.
 *
 * Each client is therefore responsible for handing this machine poses in THIS
 * convention: +yaw when the head turns to the applicant's left as they see it,
 * +pitch when the chin lifts. See the web SDK's `pose.ts` for how that is
 * enforced there.
 */
const ACTION_AXIS: Record<
  LivenessAction,
  {axis: 'yaw' | 'pitch'; direction: 1 | -1}
> = {
  turn_left: {axis: 'yaw', direction: 1},
  turn_right: {axis: 'yaw', direction: -1},
  look_up: {axis: 'pitch', direction: 1},
  look_down: {axis: 'pitch', direction: -1},
};

export interface Pose {
  yaw: number;
  pitch: number;
}

/**
 * waiting_neutral — asking the applicant to face the camera before we prompt
 * awaiting_action — prompt is on screen, watching for the movement
 * returning       — movement seen, waiting for them to come back to centre
 * done / failed   — terminal
 */
export type ChallengePhase =
  | 'waiting_neutral'
  | 'awaiting_action'
  | 'returning'
  | 'done'
  | 'failed';

export interface ChallengeState {
  actions: LivenessAction[];
  index: number;
  phase: ChallengePhase;
  /** When the current action was first prompted, for the timeout. */
  actionStartedAt: number;
  /** ms from challenge start to each completed action. */
  timingsMs: number[];
  passed: boolean[];
  startedAt: number;
  failureReason?: string;
}

export function createChallengeState(
  actions: LivenessAction[],
  now: number = Date.now(),
): ChallengeState {
  return {
    actions,
    index: 0,
    phase: 'waiting_neutral',
    actionStartedAt: now,
    timingsMs: [],
    passed: [],
    startedAt: now,
  };
}

export function isNeutral(pose: Pose): boolean {
  return (
    Math.abs(pose.yaw) <= NEUTRAL_THRESHOLD_DEG &&
    Math.abs(pose.pitch) <= NEUTRAL_THRESHOLD_DEG
  );
}

function satisfies(action: LivenessAction, pose: Pose): boolean {
  const {axis, direction} = ACTION_AXIS[action];
  const isYaw = axis === 'yaw';
  const value = isYaw ? pose.yaw : pose.pitch;
  const threshold = isYaw
    ? YAW_ACTION_THRESHOLD_DEG
    : PITCH_ACTION_THRESHOLD_DEG;
  return value * direction >= threshold;
}

/**
 * Advances the machine with one observed pose.
 *
 * Returns a new state; never mutates. `pose` is null when no face is currently
 * detected, which pauses progress rather than failing — a dropped detection
 * mid-turn is routine.
 */
export function advance(
  state: ChallengeState,
  pose: Pose | null,
  now: number = Date.now(),
): ChallengeState {
  if (state.phase === 'done' || state.phase === 'failed') {
    return state;
  }

  const action = state.actions[state.index];

  // No face: hold position, but the clock still runs so an applicant who walks
  // away doesn't leave the screen hanging forever.
  if (!pose) {
    if (
      state.phase === 'awaiting_action' &&
      now - state.actionStartedAt > ACTION_TIMEOUT_MS
    ) {
      return {...state, phase: 'failed', failureReason: 'timeout'};
    }
    return state;
  }

  switch (state.phase) {
    case 'waiting_neutral':
      // Only start the clock once they're actually centred, otherwise the
      // timeout burns while they're still getting into frame.
      return isNeutral(pose)
        ? {...state, phase: 'awaiting_action', actionStartedAt: now}
        : state;

    case 'awaiting_action': {
      if (satisfies(action, pose)) {
        return {
          ...state,
          phase: 'returning',
          timingsMs: [...state.timingsMs, now - state.startedAt],
          passed: [...state.passed, true],
        };
      }
      if (now - state.actionStartedAt > ACTION_TIMEOUT_MS) {
        return {...state, phase: 'failed', failureReason: 'timeout'};
      }
      return state;
    }

    case 'returning': {
      // Requiring a return to neutral is what stops a photo held at an angle
      // from satisfying the prompt — the server enforces the same rule.
      if (!isNeutral(pose)) {
        return state;
      }
      const nextIndex = state.index + 1;
      if (nextIndex >= state.actions.length) {
        return {...state, phase: 'done'};
      }
      return {
        ...state,
        index: nextIndex,
        phase: 'awaiting_action',
        actionStartedAt: now,
      };
    }

    default:
      return state;
  }
}

/** Human-readable prompt for the current phase. */
export function promptFor(state: ChallengeState): string {
  switch (state.phase) {
    case 'waiting_neutral':
      return 'Face the camera';
    case 'awaiting_action':
      return PROMPTS[state.actions[state.index]];
    case 'returning':
      return 'Back to centre';
    case 'done':
      return 'Done';
    case 'failed':
      // A camera fault is not the applicant's doing, and telling them to redo
      // movements they performed correctly is how a retry loop starts.
      return state.failureReason === 'capture_failed'
        ? 'The camera could not take the photo'
        : 'Let’s try that again';
  }
}

const PROMPTS: Record<LivenessAction, string> = {
  turn_left: 'Slowly turn your head left',
  turn_right: 'Slowly turn your head right',
  look_up: 'Slowly tilt your head up',
  look_down: 'Slowly tilt your head down',
};
