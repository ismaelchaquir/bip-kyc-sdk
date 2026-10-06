import { describe, expect, it } from 'vitest';
import { advance, createChallengeState, YAW_ACTION_THRESHOLD_DEG } from '@bipdelivery/core';
import type { ChallengeState } from '@bipdelivery/core';
import { captureFor, FRAMES_PER_MOVEMENT, MAX_FRAMES } from './capture-plan';
import { createCaptureQueue, recordMovement } from './capture-queue';

const NEUTRAL = { yaw: 0, pitch: 0 };
const LEFT = { yaw: YAW_ACTION_THRESHOLD_DEG + 5, pitch: 0 };
const RIGHT = { yaw: -(YAW_ACTION_THRESHOLD_DEG + 5), pitch: 0 };

/** Every capture request a pose sequence produces, in order. */
function requests(actions: ChallengeState['actions'], poses: { yaw: number; pitch: number }[]) {
  let now = 0;
  let state = createChallengeState(actions, now);
  const seen: string[] = [];
  for (const pose of poses) {
    now += 100;
    const next = advance(state, pose, now);
    const request = captureFor(state, next);
    if (request) seen.push(request);
    state = next;
  }
  return { seen, state };
}

describe('captureFor', () => {
  it('asks for movement evidence as each movement lands, and a neutral frame at each return', () => {
    const { seen, state } = requests(['turn_left', 'turn_right'], [NEUTRAL, LEFT, NEUTRAL, RIGHT, NEUTRAL]);
    expect(state.phase).toBe('done');
    expect(seen).toEqual(['movement', 'neutral', 'movement', 'neutral']);
  });

  // The bug a later capture caused: a "turn left" frame taken after the head
  // came back shows no movement, and the server rejects the applicant.
  it('never asks for movement evidence while the head is merely held or already back', () => {
    const { seen } = requests(['turn_left'], [NEUTRAL, LEFT, LEFT, LEFT]);
    expect(seen).toEqual(['movement']);
  });

  it('asks for nothing while waiting for the face to centre, or on a wrong-way turn', () => {
    const { seen } = requests(['turn_left'], [LEFT, LEFT, NEUTRAL, RIGHT, RIGHT]);
    expect(seen).toEqual([]);
  });

  it('asks for nothing when the state did not change', () => {
    const state = createChallengeState(['turn_left'], 0);
    expect(captureFor(state, state)).toBeNull();
  });

  it('keeps the worst case under the server frame cap', () => {
    // Two actions, as kyc-mz draws: per movement the frames, plus a neutral,
    // plus the selfie.
    expect(2 * (FRAMES_PER_MOVEMENT + 1) + 1).toBeLessThanOrEqual(MAX_FRAMES);
  });
});

describe('capture queue', () => {
  const deferred = () => {
    let resolve!: (value: string) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  it('runs captures one at a time, in request order', async () => {
    const pending = [deferred(), deferred()];
    let started = 0;
    const queue = createCaptureQueue(() => pending[started++].promise);

    const first = queue.enqueue();
    const second = queue.enqueue();
    await Promise.resolve();
    expect(started).toBe(1); // the second waits for the first

    pending[0].resolve('a');
    expect(await first).toBe('a');
    pending[1].resolve('b');
    expect(await second).toBe('b');
  });

  // A capture that fails must not take the queue down with it — the next one is
  // the selfie that completes the challenge.
  it('reports a failed capture, resolves it to null, and carries on', async () => {
    const errors: unknown[] = [];
    let call = 0;
    const queue = createCaptureQueue(
      () => (call++ === 0 ? Promise.reject(new Error('Camera is closed')) : Promise.resolve('selfie')),
      (error) => errors.push(error),
    );

    expect(await queue.enqueue()).toBeNull();
    expect(await queue.enqueue()).toBe('selfie');
    expect(errors).toHaveLength(1);
  });

  it('records the successful frames of a movement, spaced by the gap', async () => {
    const sleeps: number[] = [];
    let call = 0;
    const queue = createCaptureQueue(() =>
      call++ === 1 ? Promise.reject(new Error('blur')) : Promise.resolve(`frame-${call}`),
    );
    const frames: string[] = [];

    await recordMovement(queue, frames, 3, 300, async (ms) => {
      sleeps.push(ms);
    });

    expect(frames).toEqual(['frame-1', 'frame-3']);
    expect(sleeps).toEqual([300, 300]);
  });
});
