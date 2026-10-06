import { describe, expect, it } from 'vitest';
import {
  ACTION_TIMEOUT_MS,
  advance,
  createChallengeState,
  isNeutral,
  PITCH_ACTION_THRESHOLD_DEG,
  YAW_ACTION_THRESHOLD_DEG,
} from './challenge-machine';

/*
 * The rules both clients coach applicants with (see challenge-machine.ts).
 * Ported from the driver app's copy of this machine, whose logic is identical,
 * so the SDK package that web and React Native share is covered on its own.
 */

const OVER = YAW_ACTION_THRESHOLD_DEG + 5;

/** Feeds a sequence of poses, advancing the clock by `step` ms each time. */
function run(
  actions: Parameters<typeof createChallengeState>[0],
  poses: Array<{yaw: number; pitch: number} | null>,
  step = 100,
) {
  let now = 0;
  let state = createChallengeState(actions, now);
  for (const pose of poses) {
    now += step;
    state = advance(state, pose, now);
  }
  return state;
}

const NEUTRAL = {yaw: 0, pitch: 0};

describe('challenge machine', () => {
  it('completes a two-action challenge performed correctly', () => {
    const state = run(
      ['turn_left', 'turn_right'],
      [NEUTRAL, {yaw: OVER, pitch: 0}, NEUTRAL, {yaw: -OVER, pitch: 0}, NEUTRAL],
    );
    expect(state.phase).toBe('done');
    expect(state.passed).toEqual([true, true]);
    expect(state.timingsMs).toHaveLength(2);
  });

  it('does not advance until the head returns to neutral', () => {
    // Holds the turn without coming back — must stay in `returning`, which is
    // what stops a photo held at an angle from completing the challenge.
    const state = run(
      ['turn_left', 'turn_right'],
      [NEUTRAL, {yaw: OVER, pitch: 0}, {yaw: OVER, pitch: 0}, {yaw: OVER, pitch: 0}],
    );
    expect(state.phase).toBe('returning');
    expect(state.index).toBe(0);
  });

  it('ignores movement below the threshold', () => {
    const state = run(
      ['turn_left'],
      [NEUTRAL, {yaw: YAW_ACTION_THRESHOLD_DEG - 5, pitch: 0}],
    );
    expect(state.phase).toBe('awaiting_action');
  });

  // A tilt travels less far than a turn, so pitch clears at a lower angle —
  // one that would still be short of the bar for a turn.
  it('accepts a tilt that would be too small for a turn', () => {
    const pitch = PITCH_ACTION_THRESHOLD_DEG + 1;
    expect(pitch).toBeLessThan(YAW_ACTION_THRESHOLD_DEG);

    const state = run(['look_up'], [NEUTRAL, {yaw: 0, pitch}]);
    expect(state.phase).toBe('returning');
    expect(state.passed).toEqual([true]);
  });

  it('rejects a turn in the wrong direction', () => {
    const state = run(['turn_left'], [NEUTRAL, {yaw: -OVER, pitch: 0}]);
    expect(state.phase).toBe('awaiting_action');
  });

  it('fails the action after the timeout', () => {
    const state = run(
      ['turn_left'],
      [NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL],
      ACTION_TIMEOUT_MS,
    );
    expect(state.phase).toBe('failed');
    expect(state.failureReason).toBe('timeout');
  });

  it('does not start the clock until the face is neutral', () => {
    // Off-axis for a long time, then centres: the timeout must not have been
    // burning while they were getting into frame.
    const offAxis = {yaw: 40, pitch: 0};
    let now = 0;
    let state = createChallengeState(['turn_left'], now);
    for (let i = 0; i < 5; i++) {
      now += ACTION_TIMEOUT_MS;
      state = advance(state, offAxis, now);
    }
    expect(state.phase).toBe('waiting_neutral');

    now += 100;
    state = advance(state, NEUTRAL, now);
    expect(state.phase).toBe('awaiting_action');
  });

  it('holds position when no face is detected', () => {
    const state = run(['turn_left'], [NEUTRAL, null, null]);
    expect(state.phase).toBe('awaiting_action');
  });

  it('times out even while no face is detected', () => {
    const state = run(['turn_left'], [NEUTRAL, null, null], ACTION_TIMEOUT_MS);
    expect(state.phase).toBe('failed');
  });

  it('treats small deviations as neutral', () => {
    expect(isNeutral({yaw: 5, pitch: -5})).toBe(true);
    expect(isNeutral({yaw: 30, pitch: 0})).toBe(false);
  });

  it('is immutable', () => {
    const initial = createChallengeState(['turn_left'], 0);
    advance(initial, {yaw: OVER, pitch: 0}, 100);
    expect(initial.phase).toBe('waiting_neutral');
    expect(initial.passed).toEqual([]);
  });
});
