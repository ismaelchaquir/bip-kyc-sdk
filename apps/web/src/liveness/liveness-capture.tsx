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

export interface LivenessCaptureProps {
  /**
   * The server-issued challenge. The action sequence MUST come from the
   * server: a client that picks its own gives no replay protection, since an
   * attacker would choose one matching a clip they already have.
   */
  challenge: LivenessChallenge;
  /** Called once the applicant completes every action. */
  onComplete: (evidence: LivenessEvidence) => void;
  /** Called when the challenge fails — usually a timeout. Offer a retry. */
  onFailed?: (reason: string) => void;
  /** Model/WASM hosting. Self-host these for production; see useFacePose. */
  detector?: UseFacePoseOptions;
  className?: string;
}

export function LivenessCapture({
  challenge,
  onComplete,
  onFailed,
  detector,
  className,
}: LivenessCaptureProps) {
  const { videoRef, status, pose, error, capture } = useFacePose(detector);

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

  // Restart cleanly if the caller issues a new challenge (a retry).
  useEffect(() => {
    setState(createChallengeState(challenge.actions));
    framesRef.current = [];
    settledRef.current = false;
  }, [challenge.id, challenge.actions]);

  const captureFrame = useCallback(() => {
    const frame = capture();
    if (frame) framesRef.current.push(frame);
    return frame;
  }, [capture]);

  // Drive the machine from the pose stream.
  useEffect(() => {
    if (status !== 'ready' || settledRef.current) return;

    setState((current) => {
      const next = advance(current, pose);
      if (next === current) return current;

      // A frame per completed action, taken at the moment the pose satisfied
      // it — that is the evidence the server re-derives pose from, so it has to
      // be the frame where the movement actually happened, not a later one.
      if (next.phase === 'returning' && current.phase === 'awaiting_action') {
        if (!captureFrame()) {
          return {
            ...next,
            phase: 'failed' as const,
            failureReason: 'capture_failed',
          };
        }
      }
      return next;
    });
  }, [pose, status, captureFrame]);

  // Settle once, outside the reducer, so the callbacks are never called twice.
  useEffect(() => {
    if (settledRef.current) return;

    if (state.phase === 'done') {
      settledRef.current = true;
      onComplete({
        frames: framesRef.current,
        report: {
          challengeId: challenge.id,
          actions: state.actions,
          passed: state.passed,
          timingsMs: state.timingsMs,
        },
      });
    } else if (state.phase === 'failed') {
      settledRef.current = true;
      onFailed?.(state.failureReason ?? 'failed');
    }
  }, [state, challenge.id, onComplete, onFailed]);

  const prompt =
    status === 'ready'
      ? promptFor(state)
      : status === 'loading'
        ? 'Starting the camera…'
        : (error ?? 'The camera is unavailable');

  return (
    <div className={className} data-liveness-phase={state.phase}>
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
          {state.actions.map((action, i) => (
            <span
              key={`${action}-${i}`}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background:
                  i < state.index ? '#34D399' : i === state.index ? '#F5C33B' : 'rgba(255,255,255,.3)',
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
