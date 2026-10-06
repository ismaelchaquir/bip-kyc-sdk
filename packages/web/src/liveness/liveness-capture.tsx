import { useCallback, useEffect, useRef, useState } from 'react';
import {
  advance,
  createChallengeState,
  promptFor,
  type ChallengeState,
  type LivenessChallenge,
  type LivenessEvidence,
} from '@bipdelivery/core';
import { useFacePose, type UseFacePoseOptions } from './use-face-pose';
import {
  assessPortrait,
  PORTRAIT_GUIDANCE,
  SHARPNESS_SAMPLE_WIDTH,
  sharpnessOf,
} from './portrait-quality';

/**
 * Active-liveness capture for the browser.
 *
 * The mobile equivalent runs ML Kit through
 * react-native-vision-camera-face-detector; this runs MediaPipe's
 * FaceLandmarker over a <video>. Both feed the SAME challenge machine from
 * @bipdelivery/core, so an applicant meets identical thresholds whichever
 * client they use — which matters because the server judging them is the same
 * either way.
 *
 * What this does NOT do is decide anything. It coaches the applicant through
 * the movements and picks which frames to send; kyc-mz re-derives head pose
 * from those frames and makes the actual call. Treat everything here as UX, and
 * nothing as a security boundary — it is JavaScript in a browser the attacker
 * controls.
 */

/**
 * How long after the extreme the follow-up frame is taken.
 *
 * Short enough that it still lands inside the window where the pose crosses the
 * threshold, long enough that the head has stopped moving and the frame is
 * sharp. Matches the driver app.
 */
const FOLLOW_UP_FRAME_MS = 300;

/**
 * How centred the head must be for a frame to count as the neutral evidence.
 *
 * Deliberately tighter than both bars it sits between. The state machine leaves
 * `returning` at NEUTRAL_THRESHOLD_DEG (12), but challenge_verifier.py accepts a
 * neutral only within NEUTRAL_RETURN_DEG (10) — so a frame grabbed the instant
 * the machine advances is already outside what the server will take. MediaPipe
 * and insightface then disagree by another couple of degrees on the same head.
 * A run that failed on exactly this produced neutrals the server read at 12.9
 * and 14.3 degrees of yaw, with both movements detected and the pitch dead on.
 * Seven leaves room for both gaps.
 */
export const NEUTRAL_CAPTURE_DEG = 7;

export interface LivenessCaptureProps {
  /**
   * The server-issued challenge. The action sequence MUST come from the
   * server: a client that picks its own gives no replay protection, since an
   * attacker would choose one matching a clip they already have.
   */
  challenge: LivenessChallenge;
  /** Called once the applicant completes every action. */
  /**
   * Called with the challenge evidence and, separately, the frame to upload as
   * the selfie.
   *
   * The selfie is not just one of the frames: it is what face match embeds and
   * what passive liveness scores, so it has to be the applicant looking at the
   * camera. Taking `frames[0]` instead sent the first extreme of the first
   * movement — a run uploaded a selfie at 31.8 degrees of yaw while a frame at
   * 0.2 degrees sat unused later in the same array.
   */
  onComplete: (evidence: LivenessEvidence, selfie: string) => void;
  /** Called when the challenge fails — usually a timeout. Offer a retry. */
  onFailed?: (reason: string) => void;
  /** Model/WASM hosting. Self-host these for production; see useFacePose. */
  detector?: UseFacePoseOptions;
  className?: string;
}

/**
 * How long the frame must stay acceptable before the portrait is taken.
 *
 * A single good frame is easy to hit in passing — the head sweeps through
 * centre on its way somewhere else. Holding the gate for this long is what
 * makes it a deliberate pose rather than a lucky sample, and it is also what
 * stops the countdown flickering on and off while somebody settles.
 */
const PORTRAIT_HOLD_MS = 700;

/** How often the sharpness of the live frame is sampled. */
const SHARPNESS_SAMPLE_MS = 200;

export function LivenessCapture({
  challenge,
  onComplete,
  onFailed,
  detector,
  className,
}: LivenessCaptureProps) {
  const { videoRef, status, pose, framing, error, capture } = useFacePose(detector);

  const [state, setState] = useState<ChallengeState>(() =>
    createChallengeState(challenge.actions),
  );

  /**
   * Frames captured so far.
   *
   * A ref, not state: the render loop writes to it every time an action
   * completes, and re-rendering the video element mid-challenge would tear down
   * the preview the applicant is looking at.
   */
  const framesRef = useRef<string[]>([]);
  /** Guards onComplete/onFailed against a second call from a late frame. */
  const settledRef = useRef(false);

  /**
   * The straight-on portrait, taken before the challenge begins.
   *
   * This is the frame face match embeds and passive liveness scores, so it is
   * captured deliberately rather than salvaged from the movement sequence. It
   * also gates the run: an applicant whose face the camera cannot see is told
   * so in two seconds, instead of completing both movements and having the
   * upload come back "no face detected in the selfie" — which is what happened
   * to a real applicant.
   *
   * It is NOT a third challenge. The server issues and verifies the two
   * movements; this adds no anti-spoof evidence of its own, and the binding
   * between it and the challenge is checked server-side by comparing its face
   * against the frames.
   */
  const portraitRef = useRef<string | null>(null);
  const [portraitTaken, setPortraitTaken] = useState(false);
  const [sharpness, setSharpness] = useState<number | null>(null);
  const holdSinceRef = useRef<number | null>(null);
  /** Pending follow-up capture, so it can be cancelled when the run ends. */
  const followUpRef = useRef<number | null>(null);
  /** One centred frame per action; reset when the next movement is captured. */
  const centredCapturedRef = useRef(false);
  /** The most centred frame captured so far, and how far off centre it was. */
  const bestNeutralRef = useRef<{ frame: string; deviation: number } | null>(null);

  // Restart cleanly if the caller issues a new challenge (a retry).
  useEffect(() => {
    setState(createChallengeState(challenge.actions));
    framesRef.current = [];
    settledRef.current = false;
    centredCapturedRef.current = false;
    bestNeutralRef.current = null;
    portraitRef.current = null;
    holdSinceRef.current = null;
    setPortraitTaken(false);
    return () => {
      if (followUpRef.current !== null) {
        window.clearTimeout(followUpRef.current);
        followUpRef.current = null;
      }
    };
  }, [challenge.id, challenge.actions]);

  const captureFrame = useCallback(() => {
    const frame = capture();
    if (frame) framesRef.current.push(frame);
    return frame;
  }, [capture]);

  /**
   * Two frames at the extreme, a moment apart.
   *
   * One still gives a single attempt at a window of roughly a second, and loses
   * it to motion blur often enough to reject someone who performed the movement
   * correctly — the frame is grabbed at the instant the head is moving fastest.
   * The follow-up lands nearer the peak, where the head has usually settled.
   * The driver app takes the same two for the same reason.
   */
  const captureMovement = useCallback(() => {
    centredCapturedRef.current = false;
    const first = captureFrame();
    followUpRef.current = window.setTimeout(
      () => captureFrame(),
      FOLLOW_UP_FRAME_MS,
    );
    return first;
  }, [captureFrame]);

  // Sample sharpness on its own cadence. Reading pixels back off the GPU is
  // far too expensive to do on every animation frame, and blur does not change
  // faster than this anyway.
  useEffect(() => {
    if (portraitTaken || status !== 'ready') return;

    const canvas = document.createElement('canvas');
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video?.videoWidth) return;

      const width = SHARPNESS_SAMPLE_WIDTH;
      const height = Math.max(
        1,
        Math.round((video.videoHeight / video.videoWidth) * width),
      );
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);
      setSharpness(sharpnessOf(ctx.getImageData(0, 0, width, height)));
    }, SHARPNESS_SAMPLE_MS);

    return () => window.clearInterval(timer);
  }, [portraitTaken, status, videoRef]);

  const assessment = portraitTaken
    ? null
    : assessPortrait(pose, framing, sharpness);

  // Take the portrait once the frame has been good for long enough.
  useEffect(() => {
    if (portraitTaken || status !== 'ready' || !assessment) return;

    if (!assessment.ok) {
      holdSinceRef.current = null;
      return;
    }

    const now = performance.now();
    if (holdSinceRef.current === null) {
      holdSinceRef.current = now;
      return;
    }
    if (now - holdSinceRef.current < PORTRAIT_HOLD_MS) return;

    const frame = capture();
    if (!frame) return;

    portraitRef.current = frame;
    // First in the evidence as well as being the selfie. The server compares
    // the selfie against these frames, and a genuine session's portrait is the
    // strongest match in the set.
    framesRef.current.push(frame);
    setPortraitTaken(true);
  }, [assessment, capture, portraitTaken, status]);

  // Drive the machine from the pose stream.
  useEffect(() => {
    if (status !== 'ready' || settledRef.current) return;
    // The challenge does not start until there is a portrait to bind it to.
    if (!portraitTaken) return;

    setState((current) => {
      const next = advance(current, pose);
      if (next === current) return current;

      // At the extreme: the frames whose pose actually crosses the threshold,
      // which is what the server re-derives the movement from.
      if (next.phase === 'returning' && current.phase === 'awaiting_action') {
        if (!captureMovement()) {
          return {
            ...next,
            phase: 'failed' as const,
            failureReason: 'capture_failed',
          };
        }
      }

      // At the machine's return to centre. A fallback for the neutral evidence,
      // not the evidence itself: this fires the moment the pose clears 12
      // degrees, which the server may well read as more than the 10 it accepts.
      // The effect below is what actually lands a usable neutral; this stays
      // because a run where the head never settles inside NEUTRAL_CAPTURE_DEG
      // is better off offering a marginal frame than none at all.
      if (current.phase === 'returning' && next.phase !== 'returning') {
        captureFrame();
      }

      return next;
    });
  }, [pose, status, captureFrame, captureMovement]);

  // The neutral evidence, taken independently of the machine's phase.
  //
  // challenge_verifier.py requires at least one frame within NEUTRAL_RETURN_DEG
  // on both axes — a print held at a fixed angle can satisfy "turn left" but can
  // never also be neutral, so this is what separates a real head from a photo.
  // Keying it off the pose rather than the phase is what makes it reliable: the
  // head is squarely centred before the first prompt and again as it swings
  // through centre between two opposite turns, and those moments are well
  // inside the server's bar. The phase transition is not.
  useEffect(() => {
    if (status !== 'ready' || settledRef.current || !pose) return;
    if (!portraitTaken || centredCapturedRef.current) return;
    if (
      Math.abs(pose.yaw) > NEUTRAL_CAPTURE_DEG ||
      Math.abs(pose.pitch) > NEUTRAL_CAPTURE_DEG
    ) {
      return;
    }
    centredCapturedRef.current = true;
    const frame = captureFrame();
    if (!frame) return;

    // Keep the straightest one for the selfie. Every capture here is already
    // inside NEUTRAL_CAPTURE_DEG, so this is choosing between good frames.
    const deviation = Math.abs(pose.yaw) + Math.abs(pose.pitch);
    const best = bestNeutralRef.current;
    if (!best || deviation < best.deviation) {
      bestNeutralRef.current = { frame, deviation };
    }
  }, [pose, status, captureFrame]);

  // Settle once, outside the reducer, so the callbacks are never called twice.
  useEffect(() => {
    if (settledRef.current) return;

    if (state.phase === 'done') {
      settledRef.current = true;
      // A pending follow-up would otherwise push into the array after the
      // caller already has it — a capture nobody reads, mutating something
      // being uploaded.
      if (followUpRef.current !== null) {
        window.clearTimeout(followUpRef.current);
        followUpRef.current = null;
      }
      onComplete(
        {
          // A snapshot. framesRef keeps being written to on a retry, and handing
          // out the live array makes the previous attempt's evidence change
          // underneath whoever is uploading it.
          frames: [...framesRef.current],
          report: {
            challengeId: challenge.id,
            actions: state.actions,
            passed: state.passed,
            timingsMs: state.timingsMs,
          },
        },
        // The deliberate portrait, which is the whole point of taking one.
        // The centred challenge frame remains the fallback for a client that
        // somehow reached the challenge without one.
        portraitRef.current ??
          bestNeutralRef.current?.frame ??
          framesRef.current[0],
      );
    } else if (state.phase === 'failed') {
      settledRef.current = true;
      if (followUpRef.current !== null) {
        window.clearTimeout(followUpRef.current);
        followUpRef.current = null;
      }
      onFailed?.(state.failureReason ?? 'failed');
    }
  }, [state, challenge.id, onComplete, onFailed]);

  const prompt =
    status !== 'ready'
      ? status === 'loading'
        ? 'Starting the camera…'
        : (error ?? 'The camera is unavailable')
      : !portraitTaken
        ? assessment?.ok
          ? 'Hold still…'
          : (PORTRAIT_GUIDANCE[assessment!.problem!] ??
             'Look straight at the camera')
        : promptFor(state);

  return (
    <div
      className={className}
      data-liveness-phase={portraitTaken ? state.phase : 'portrait'}
    >
      <div style={{ position: 'relative' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          // Mirrored so the applicant sees themselves as in a mirror; the
          // captured frames are deliberately NOT mirrored (see capture()), and
          // pose.ts undoes this flip so "turn left" means their left.
          style={{ width: '100%', transform: 'scaleX(-1)' }}
        />

        {/* Progress through the sequence, so the applicant can see there is an
            end to this rather than being prompted indefinitely. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            right: 12,
            display: 'flex',
            gap: 4,
          }}
        >
          {/* The portrait is a step the applicant performs, so it gets a pip
              like the movements do — otherwise the bar appears to sit still
              through the first thing they are asked to do. */}
          <span
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: portraitTaken ? '#34D399' : '#F5C33B',
            }}
          />
          {state.actions.map((action, i) => (
            <span
              key={`${action}-${i}`}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: !portraitTaken
                  ? 'rgba(255,255,255,.3)'
                  : i < state.index
                    ? '#34D399'
                    : i === state.index
                      ? '#F5C33B'
                      : 'rgba(255,255,255,.3)',
              }}
            />
          ))}
        </div>
      </div>

      {/* aria-live so the prompt is announced: this is an instruction the
          applicant must act on, and a purely visual one excludes anyone using
          a screen reader from the flow entirely. */}
      <p role="status" aria-live="assertive">
        {prompt}
      </p>

      {status === 'ready' && !pose && state.phase !== 'done' && (
        <p aria-live="polite">Move into the frame</p>
      )}
    </div>
  );
}
