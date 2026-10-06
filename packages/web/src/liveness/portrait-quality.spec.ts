import { describe, expect, it } from 'vitest';
import {
  assessPortrait,
  MAX_FACE_OFFSET,
  MIN_FACE_SPAN,
  MIN_SHARPNESS,
  PORTRAIT_GUIDANCE,
  PORTRAIT_YAW_DEG,
  sharpnessOf,
} from './portrait-quality';

const GOOD_FRAMING = { faceSpan: 0.35, offsetX: 0.05, offsetY: 0.05 };
const STRAIGHT = { yaw: 0, pitch: 0 };

const assess = (
  pose = STRAIGHT as any,
  framing = GOOD_FRAMING as any,
  sharpness: number | null = 40,
) => assessPortrait(pose, framing, sharpness);

describe('the portrait gate', () => {
  it('accepts a straight, close, sharp face', () => {
    expect(assess()).toEqual({ ok: true });
  });

  /**
   * The run this exists for: an applicant completed both movements and the
   * upload came back "no face detected in the selfie". Caught here it costs
   * two seconds instead of the whole verification.
   */
  it('refuses a frame with no face at all', () => {
    expect(assess(null).problem).toBe('no_face');
    expect(assess(STRAIGHT as any, null).problem).toBe('no_face');
  });

  it('refuses a face too small to embed well', () => {
    const small = { ...GOOD_FRAMING, faceSpan: MIN_FACE_SPAN - 0.01 };

    expect(assess(STRAIGHT as any, small).problem).toBe('too_far');
  });

  it('refuses a face drifting out of frame', () => {
    const edge = { ...GOOD_FRAMING, offsetX: MAX_FACE_OFFSET + 0.01 };

    expect(assess(STRAIGHT as any, edge).problem).toBe('off_centre');
  });

  it('refuses a head that is not actually facing the camera', () => {
    expect(assess({ yaw: PORTRAIT_YAW_DEG + 1, pitch: 0 } as any).problem).toBe(
      'not_straight',
    );
  });

  it('refuses a frame blurred by movement', () => {
    expect(assess(STRAIGHT as any, GOOD_FRAMING, MIN_SHARPNESS - 1).problem).toBe(
      'too_blurry',
    );
  });

  it('does not refuse a frame whose sharpness was not sampled', () => {
    // Sharpness runs on a slower cadence than the pose; "not measured" is not
    // "measured badly".
    expect(assess(STRAIGHT as any, GOOD_FRAMING, null)).toEqual({ ok: true });
  });

  /**
   * Order matters more than it looks. Telling somebody to hold still while
   * their face is outside the frame is noise.
   */
  it('reports the problem that blocks the others first', () => {
    const farAndTurned = { ...GOOD_FRAMING, faceSpan: 0.1 };

    expect(assess({ yaw: 40, pitch: 0 } as any, farAndTurned, 1).problem).toBe(
      'too_far',
    );
  });

  it('has something to say for every problem it can report', () => {
    const problems = [
      assess(null),
      assess(STRAIGHT as any, { ...GOOD_FRAMING, faceSpan: 0.1 }),
      assess(STRAIGHT as any, { ...GOOD_FRAMING, offsetX: 0.9 }),
      assess({ yaw: 45, pitch: 0 } as any),
      assess(STRAIGHT as any, GOOD_FRAMING, 0),
    ];

    for (const { problem } of problems) {
      expect(PORTRAIT_GUIDANCE[problem!]).toBeTruthy();
    }
  });
});

describe('sharpness', () => {
  const image = (fill: (x: number, y: number) => number, size = 32): ImageData => {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = fill(x, y);
        const p = (y * size + x) * 4;
        data[p] = data[p + 1] = data[p + 2] = v;
        data[p + 3] = 255;
      }
    }
    return { data, width: size, height: size, colorSpace: 'srgb' } as ImageData;
  };

  it('is zero for a flat frame', () => {
    expect(sharpnessOf(image(() => 128))).toBeCloseTo(0);
  });

  it('is near zero for a smooth gradient, which is what blur looks like', () => {
    expect(sharpnessOf(image((x) => x * 4))).toBeLessThan(MIN_SHARPNESS);
  });

  it('is high for hard edges, which is what focus looks like', () => {
    expect(sharpnessOf(image((x) => ((x >> 1) % 2 ? 255 : 0)))).toBeGreaterThan(
      MIN_SHARPNESS,
    );
  });

  it('survives a degenerate frame without dividing by zero', () => {
    expect(sharpnessOf(image(() => 0, 2))).toBe(0);
  });
});
