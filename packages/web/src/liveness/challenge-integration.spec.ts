import { describe, expect, it } from 'vitest';
import type { Matrix } from '@mediapipe/tasks-vision';
import {
  advance,
  createChallengeState,
  NEUTRAL_THRESHOLD_DEG,
  YAW_ACTION_THRESHOLD_DEG,
  type LivenessAction,
} from '@bipdelivery/core';
import { poseFromMatrix } from './pose';
import { NEUTRAL_CAPTURE_DEG } from './liveness-capture';

/**
 * The seam between MediaPipe and the shared rules.
 *
 * pose.spec.ts proves the matrix math and core's own tests prove the machine;
 * what neither covers is that a head turned a given way produces a pose the
 * machine reads as the RIGHT action. That is the join where a sign error hides,
 * and where it costs the most: "turn left" passing in the browser and failing
 * on the server reads to the applicant as a random rejection.
 */
function transform(yawDeg: number, pitchDeg: number): Matrix {
  const rad = (d: number) => (d * Math.PI) / 180;
  const [cy, sy] = [Math.cos(rad(yawDeg)), Math.sin(rad(yawDeg))];
  const [cx, sx] = [Math.cos(rad(pitchDeg)), Math.sin(rad(pitchDeg))];
  const r = [
    [cy, sy * sx, sy * cx],
    [0, cx, -sx],
    [-sy, cy * sx, cy * cx],
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

/** What the hook feeds the machine: a matrix in, a Pose out. */
const observe = (yawDeg: number, pitchDeg = 0) => {
  const p = poseFromMatrix(transform(yawDeg, pitchDeg))!;
  return { yaw: p.yaw, pitch: p.pitch };
};

/** Drives a challenge to completion the way the component does. */
function perform(actions: LivenessAction[], poses: Array<{ yaw: number; pitch: number } | null>) {
  let now = 0;
  let state = createChallengeState(actions, now);
  for (const pose of poses) {
    now += 100;
    state = advance(state, pose, now);
  }
  return state;
}

const NEUTRAL = observe(0);
const OVER = YAW_ACTION_THRESHOLD_DEG + 8;

describe('MediaPipe pose driving the shared challenge machine', () => {
  it('reads a neutral head as neutral', () => {
    expect(Math.abs(NEUTRAL.yaw)).toBeLessThan(NEUTRAL_THRESHOLD_DEG);
    expect(Math.abs(NEUTRAL.pitch)).toBeLessThan(NEUTRAL_THRESHOLD_DEG);
  });

  /**
   * The sign contract, stated as a test.
   *
   * The preview is mirrored, so an applicant turning to THEIR left produces a
   * negative raw yaw from MediaPipe, which pose.ts flips to positive — and
   * positive yaw is what core's ACTION_AXIS defines as `turn_left`. Every link
   * in that chain has to hold for this to pass.
   */
  it('satisfies turn_left when the applicant turns to their own left', () => {
    const state = perform(
      ['turn_left'],
      [NEUTRAL, observe(-OVER), observe(-OVER), NEUTRAL],
    );
    expect(state.phase).toBe('done');
    expect(state.passed).toEqual([true]);
  });

  it('satisfies turn_right in the opposite direction', () => {
    const state = perform(
      ['turn_right'],
      [NEUTRAL, observe(OVER), observe(OVER), NEUTRAL],
    );
    expect(state.phase).toBe('done');
  });

  // The failure this whole test file exists to catch.
  it('does NOT satisfy turn_left when they turn the other way', () => {
    const state = perform(['turn_left'], [NEUTRAL, observe(OVER), observe(OVER)]);
    expect(state.phase).not.toBe('done');
    expect(state.passed).toEqual([]);
  });

  it('runs a multi-action sequence in order', () => {
    const state = perform(
      ['turn_left', 'turn_right'],
      [NEUTRAL, observe(-OVER), NEUTRAL, observe(OVER), NEUTRAL],
    );
    expect(state.phase).toBe('done');
    expect(state.passed).toEqual([true, true]);
    expect(state.timingsMs).toHaveLength(2);
  });

  // A dropped detection mid-turn is routine — a blink, a hand, a dark frame.
  it('holds position when the face is momentarily lost', () => {
    const state = perform(
      ['turn_left'],
      [NEUTRAL, null, null, observe(-OVER), NEUTRAL],
    );
    expect(state.phase).toBe('done');
  });

  // Requiring the return to centre is what stops a held photo satisfying a prompt.
  it('does not advance until they come back to centre', () => {
    const state = perform(['turn_left', 'turn_right'], [NEUTRAL, observe(-OVER), observe(-OVER)]);
    expect(state.phase).toBe('returning');
    expect(state.index).toBe(0);
  });
});

/**
 * Which frames the capture must collect.
 *
 * The server does not just re-derive the movements — challenge_verifier.py also
 * requires at least one frame within NEUTRAL_RETURN_DEG on both axes, because a
 * photo held at a fixed angle can satisfy "turn left" but can never also be
 * neutral. Capturing only at the extremes produced a run where every movement
 * was detected and the verification still failed with "Head never returned to a
 * neutral pose".
 *
 * These assert the phase transitions the component captures on, which is the
 * part that decides which frames exist.
 */
describe('frame capture points', () => {
  const NEUTRAL_RETURN_DEG = 10;

  it('the transition into `returning` marks the extreme', () => {
    let now = 0;
    let state = createChallengeState(['turn_left'], now);
    state = advance(state, NEUTRAL, (now += 100));
    const before = state.phase;
    state = advance(state, observe(-OVER), (now += 100));

    expect(before).toBe('awaiting_action');
    expect(state.phase).toBe('returning');
  });

  it('the transition OUT of `returning` marks a fallback frame', () => {
    let now = 0;
    let state = createChallengeState(['turn_left', 'turn_right'], now);
    state = advance(state, NEUTRAL, (now += 100));
    state = advance(state, observe(-OVER), (now += 100));
    expect(state.phase).toBe('returning');

    state = advance(state, NEUTRAL, (now += 100));
    expect(state.phase).not.toBe('returning');
  });

  /**
   * Why that transition is NOT the neutral evidence.
   *
   * The machine releases at the first pose inside NEUTRAL_THRESHOLD_DEG, and a
   * head still swinging back clears 12 degrees well before it reaches centre.
   * The server accepts a neutral only within 10. A real run failed here: both
   * movements detected, pitch dead on, and the two neutral frames read by the
   * server at 12.85 and 14.25 degrees of yaw.
   */
  it('a pose the machine calls neutral can still be too turned for the server', () => {
    const atRelease = observe(NEUTRAL_THRESHOLD_DEG - 0.1);

    let now = 0;
    let state = createChallengeState(['turn_left'], now);
    state = advance(state, NEUTRAL, (now += 100));
    state = advance(state, observe(-OVER), (now += 100));
    state = advance(state, atRelease, (now += 100));

    expect(state.phase).not.toBe('returning');
    expect(Math.abs(atRelease.yaw)).toBeGreaterThan(NEUTRAL_RETURN_DEG);
  });

  // So the component captures on the pose instead, at a bar tight enough that
  // the server still accepts the frame after the two models disagree on it.
  it('NEUTRAL_CAPTURE_DEG leaves the server margin the release bar does not', () => {
    expect(NEUTRAL_CAPTURE_DEG).toBeLessThan(NEUTRAL_RETURN_DEG);
    expect(NEUTRAL_CAPTURE_DEG).toBeLessThan(NEUTRAL_THRESHOLD_DEG);

    const captured = observe(NEUTRAL_CAPTURE_DEG, NEUTRAL_CAPTURE_DEG);
    expect(Math.abs(captured.yaw)).toBeLessThanOrEqual(NEUTRAL_CAPTURE_DEG + 0.01);
    expect(Math.abs(captured.pitch)).toBeLessThanOrEqual(NEUTRAL_CAPTURE_DEG + 0.01);
  });

  // The last action leaves `returning` for `done`, not for another action — so
  // a condition written as "moved to the next action" would miss the neutral
  // frame on the final movement, which is the only one on a one-action
  // challenge.
  it('leaves `returning` on the FINAL action too', () => {
    let now = 0;
    let state = createChallengeState(['turn_left'], now);
    state = advance(state, NEUTRAL, (now += 100));
    state = advance(state, observe(-OVER), (now += 100));
    expect(state.phase).toBe('returning');

    state = advance(state, NEUTRAL, (now += 100));
    expect(state.phase).toBe('done');
  });
});
