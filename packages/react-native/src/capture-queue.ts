/**
 * Serialises still captures, in request order.
 *
 * Poses arrive continuously while a still capture takes hundreds of
 * milliseconds, so requests overlap. Two things went wrong before this existed:
 * overlapping captures were dropped, which lost the evidence for a movement the
 * applicant had performed; and the final selfie raced a movement capture still
 * in flight and lost, abandoning a challenge that had just passed. Order also
 * matters to the server, which reads the frames in upload order.
 *
 * A failed capture resolves to null rather than rejecting, and is reported
 * through `onError` — never swallowed. A capture that fails silently looks
 * exactly like an applicant who did not move.
 */
export interface CaptureQueue {
  enqueue(): Promise<string | null>;
}

export function createCaptureQueue(
  capture: () => Promise<string>,
  onError: (error: unknown) => void = () => {},
): CaptureQueue {
  let tail: Promise<unknown> = Promise.resolve();

  return {
    enqueue() {
      const next = tail.then(() =>
        capture().catch((error) => {
          onError(error);
          return null;
        }),
      );
      tail = next;
      return next;
    },
  };
}

/**
 * Capture `count` frames for one movement, `gapMs` apart, appending each that
 * succeeds to `frames`.
 */
export async function recordMovement(
  queue: CaptureQueue,
  frames: string[],
  count: number,
  gapMs: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    if (i > 0) await sleep(gapMs);
    const uri = await queue.enqueue();
    if (uri) frames.push(uri);
  }
}
