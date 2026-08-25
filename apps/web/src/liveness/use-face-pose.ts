import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { Pose } from '@bipdelivery/core';
import { poseFromMatrix } from './pose';

/**
 * Head pose from the webcam, once per animation frame.
 *
 * The mobile app gets this from react-native-vision-camera-face-detector, which
 * hands over yaw/pitch directly. The browser has no such thing, so this runs
 * MediaPipe's FaceLandmarker over the video element and derives pose from the
 * facial transformation matrix it can emit.
 *
 * What the caller gets is the same shape the challenge machine wants, so the
 * rules in @bipdelivery/core work unchanged across both clients.
 */

export type FacePoseStatus =
  /** Model and camera not up yet. */
  | 'loading'
  /** Running; `pose` is fresh each frame, null when no face is in view. */
  | 'ready'
  /** The applicant refused the camera, or there isn't one. */
  | 'denied'
  /** Model failed to load, WebGL unavailable, or the video died. */
  | 'error';

export interface UseFacePoseOptions {
  /**
   * Where the WASM binaries and the model live.
   *
   * Defaults to jsDelivr, which is what every MediaPipe sample does — and which
   * is the wrong default for identity verification, so it is overridable and
   * loudly documented. Self-host these (they ship inside
   * @mediapipe/tasks-vision) and point this at your own origin: a KYC capture
   * that phones a third-party CDN leaks that a given user is being verified,
   * right now, to whoever runs the CDN, and stops working entirely when they
   * do. See README for the copy step.
   */
  wasmPath?: string;
  modelAssetPath?: string;
  /** Start detecting immediately. Off lets a caller gate on user consent. */
  enabled?: boolean;
}

const CDN_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export interface UseFacePoseResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: FacePoseStatus;
  /** Latest pose, or null when no face is detected this frame. */
  pose: Pose | null;
  /** Why status is 'error' / 'denied', for the UI to show. */
  error: string | null;
  /** Grab the current video frame as a JPEG data URI, for the evidence upload. */
  capture: () => string | null;
}

/**
 * A phone, for the purpose of choosing camera constraints.
 *
 * User-agent sniffing, which is normally the wrong tool — but the thing being
 * detected here IS the device class, and there is no feature query for "this
 * camera is a portrait phone sensor". Touch support says nothing (touchscreen
 * laptops) and screen width says nothing (a small window).
 */
const isPhone = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * getUserMedia constraints, front camera.
 *
 * Mobile and desktop are asked for different things on purpose. Requesting a
 * landscape 1280x720 from a phone held upright makes the browser pick a mode
 * that then arrives rotated or letterboxed — the face ends up small and
 * off-centre in the frame, which costs detection accuracy for no benefit. Phones
 * get a resolution they can serve natively in portrait and are left to choose
 * the rest.
 *
 * `facingMode: 'user'` rather than a deviceId: this is a selfie check, the front
 * camera is the only correct one, and enumerating devices needs a permission we
 * have not been granted yet at this point.
 */
function cameraConstraints(): MediaStreamConstraints {
  return {
    audio: false,
    video: isPhone()
      ? {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 1280 },
          frameRate: { ideal: 30, max: 30 },
        }
      : {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
  };
}

export function useFacePose({
  wasmPath = CDN_WASM,
  modelAssetPath = CDN_MODEL,
  enabled = true,
}: UseFacePoseOptions = {}): UseFacePoseResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /**
   * detectForVideo REJECTS a timestamp that is not strictly increasing, and
   * requestAnimationFrame can fire twice within the same millisecond. Tracking
   * the last one lets us skip rather than throw.
   */
  const lastTimestampRef = useRef(-1);

  const [status, setStatus] = useState<FacePoseStatus>('loading');
  const [pose, setPose] = useState<Pose | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Drawn UNMIRRORED regardless of how the preview is displayed. The mirror
    // is a courtesy to the applicant looking at themselves; the server matches
    // this frame against a document photo, and a flipped face is a different
    // face to a matcher.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const start = async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(wasmPath);
        if (cancelled) return;

        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          // The whole reason this task is used rather than a face DETECTOR:
          // the transformation matrix is what yields head pose.
          outputFacialTransformationMatrixes: true,
          // Not requested. Blendshapes are ~52 extra floats per frame and
          // nothing here reads them.
          outputFaceBlendshapes: false,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;

        const stream = await navigator.mediaDevices.getUserMedia(
          cameraConstraints(),
        );
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        // iOS Safari rejects play() when the tab is not frontmost, and treats a
        // rejected promise as fatal if unhandled. The stream is already
        // attached, so a rejection here only means playback starts late — the
        // detection loop skips frames until readyState catches up.
        await video.play().catch(() => undefined);
        if (cancelled) return;

        setStatus('ready');
        loop();
      } catch (err) {
        if (cancelled) return;
        const denied =
          err instanceof DOMException &&
          (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
        setStatus(denied ? 'denied' : 'error');
        setError(
          denied
            ? 'Camera access was refused.'
            : err instanceof Error
              ? err.message
              : 'Could not start the camera.',
        );
      }
    };

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;

      // Milliseconds, and strictly increasing — see lastTimestampRef.
      const timestamp = performance.now();
      if (timestamp <= lastTimestampRef.current) return;
      lastTimestampRef.current = timestamp;

      let result: FaceLandmarkerResult;
      try {
        result = landmarker.detectForVideo(video, timestamp);
      } catch {
        // A single dropped frame is routine (a resize, a backgrounded tab).
        // Losing the whole loop over one is not.
        return;
      }

      const next = poseFromMatrix(result.facialTransformationMatrixes?.[0]);
      // null propagates deliberately: the challenge machine treats "no face" as
      // "hold position", which is the right response to a momentary dropout.
      setPose(next ? { yaw: next.yaw, pitch: next.pitch } : null);
    };

    start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // Both matter. An unclosed landmarker leaks its WASM heap, and an
      // unstopped track leaves the camera light on after the applicant has
      // moved on — which reads as the site still watching them.
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [enabled, wasmPath, modelAssetPath]);

  return { videoRef, status, pose, error, capture };
}
