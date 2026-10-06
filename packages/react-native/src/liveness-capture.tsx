import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { TextStyle } from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { createFaceDetectorOutput } from 'react-native-vision-camera-face-detector';
import { advance, createChallengeState } from '@bipdelivery/core';
import type { ChallengeState, ClientChallengeReport, LivenessAction } from '@bipdelivery/core';
import { captureFor, FOLLOW_UP_FRAME_MS, FRAMES_PER_MOVEMENT } from './capture-plan';
import { createCaptureQueue, recordMovement } from './capture-queue';
import { defaultLabels, defaultTheme } from './theme';
import type { LivenessLabels, LivenessTheme } from './theme';
import { useResolvedCameraDevice } from './use-camera-device';

export interface LivenessCaptureProps {
  /** Actions drawn by kyc-mz. Never chosen on the device. */
  actions: LivenessAction[];
  challengeId: string;
  /** Pauses the camera and shows progress while the caller uploads. */
  isUploading?: boolean;
  /** Called once every action has been performed and the selfie taken. */
  onComplete: (selfieUri: string, frameUris: string[], report: ClientChallengeReport) => void;
  /**
   * Draw a new challenge from the server. Retrying against the current one is
   * not an option: a challenge is single-use and expires, so an applicant who
   * tries a few times would upload against a dead one and be rejected for it.
   * Give the new challenge's id as this component's `key` so it remounts.
   */
  onRetry: () => void;
  onCancel: () => void;
  theme?: Partial<LivenessTheme>;
  labels?: Partial<LivenessLabels>;
  /** Logs the pose trace to the console, for checking sign conventions on a new device. */
  debug?: boolean;
}

/**
 * Active-liveness capture: prompts the applicant through a server-issued
 * sequence of head movements and collects the frames proving they performed it.
 *
 * The on-device pass/fail only drives the UI and picks frames. kyc-mz re-derives
 * head pose from the uploaded frames and makes the real decision, because
 * anything decided here can be patched out of the app.
 *
 * Frames are captured as each movement is satisfied and at each return to
 * centre (capture-plan.ts) — exactly the evidence the server-side verifier looks
 * for. The last frame, head-on, is the selfie used for face matching.
 */
export function LivenessCapture({
  actions,
  challengeId,
  isUploading = false,
  onComplete,
  onRetry,
  onCancel,
  theme: themeOverrides,
  labels: labelOverrides,
  debug = false,
}: LivenessCaptureProps) {
  const theme = { ...defaultTheme, ...themeOverrides };
  const labels = { ...defaultLabels, ...labelOverrides };
  const styles = useMemo(() => makeStyles(theme), [JSON.stringify(theme)]);

  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const { device, unavailable } = useResolvedCameraDevice('front');
  const [state, setState] = useState<ChallengeState>(() => createChallengeState(actions));
  const [faceVisible, setFaceVisible] = useState(false);

  // Frames are collected in a ref: re-rendering on every capture would drop
  // detections mid-movement.
  const framesRef = useRef<string[]>([]);
  const finishedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const photoOutput = usePhotoOutput({
    // Lower than a document capture: these frames only need to be good enough
    // for pose estimation, and a 4K still per movement stalls the challenge.
    targetResolution: CommonResolutions.FHD_4_3,
    containerFormat: 'jpeg',
    quality: 0.8,
    qualityPrioritization: 'speed',
  });

  const queue = useMemo(
    () =>
      createCaptureQueue(
        () =>
          photoOutput
            .capturePhotoToFile({ flashMode: 'off' }, {})
            .then((file) => `file://${file.filePath}`),
        (error) => console.warn('[liveness] photo capture failed', error),
      ),
    [photoOutput],
  );

  /**
   * Built directly rather than through `useFaceDetectorOutput`, which memoizes
   * on an object it creates itself and so returns a new output every render. A
   * new output reconfigures the camera session and aborts any capture in flight
   * ("Camera is closed"), and this screen re-renders on every pose sample, so
   * no capture survived. The handler goes through a ref so the output stays
   * stable for the session while still seeing current state.
   */
  const onFacesRef = useRef<(faces: { yawAngle: number; pitchAngle: number }[]) => void>(() => {});
  const faceDetectorOutput = useMemo(
    () =>
      createFaceDetectorOutput({
        performanceMode: 'fast',
        // The challenge is decided on head pose alone; landmarks and contours
        // would slow the detector below what tracking a turn needs.
        runLandmarks: false,
        runContours: false,
        runClassifications: false,
        cameraFacing: 'front',
        onFacesDetected(faces) {
          onFacesRef.current(faces);
        },
        onError(error) {
          console.warn('[liveness] face detection failed', error);
        },
      }),
    [],
  );

  onFacesRef.current = (faces) => {
    // Nothing left to decide once the challenge is over.
    const previous = stateRef.current;
    if (finishedRef.current || previous.phase === 'done' || previous.phase === 'failed') return;

    const face = faces[0];
    setFaceVisible(!!face);

    const next = advance(previous, face ? { yaw: face.yawAngle, pitch: face.pitchAngle } : null);
    if (debug) logSample(face, previous, next);
    if (next === previous) return;

    const request = captureFor(previous, next);
    if (request === 'movement') {
      void recordMovement(queue, framesRef.current, FRAMES_PER_MOVEMENT, FOLLOW_UP_FRAME_MS);
    } else if (request === 'neutral') {
      void queue.enqueue().then((uri) => {
        if (uri) framesRef.current.push(uri);
      });
    }

    stateRef.current = next;
    setState(next);
  };

  useEffect(() => {
    if (!hasPermission && canRequestPermission) void requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);

  useEffect(() => {
    photoOutput.prepareSettings([{ flashMode: 'off' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Finishing is a side effect of reaching `done`, not something the detector
  // callback does inline, so the final capture can be awaited cleanly.
  useEffect(() => {
    if (state.phase !== 'done' || finishedRef.current) return;
    finishedRef.current = true;

    void (async () => {
      // Queued behind any movement capture still running, so it cannot lose
      // the race that used to abandon a passed challenge.
      const selfie = await queue.enqueue();
      if (!selfie) {
        // A camera fault, not the applicant's. Say so, and let them retry.
        finishedRef.current = false;
        setState((current) => ({ ...current, phase: 'failed', failureReason: 'capture_failed' }));
        return;
      }
      onComplete(selfie, framesRef.current, {
        challengeId,
        actions,
        passed: state.passed,
        timingsMs: state.timingsMs,
      });
    })();
  }, [state, actions, challengeId, queue, onComplete]);

  if (!hasPermission) {
    return (
      <Message styles={styles} title={labels.permissionTitle} body={labels.permissionBody} action={labels.goBack} onAction={onCancel} />
    );
  }

  if (unavailable) {
    return (
      <Message styles={styles} title={labels.unavailableTitle} body={labels.unavailableBody} action={labels.goBack} onAction={onCancel} />
    );
  }

  // The device arrives asynchronously; rendering <Camera> before it does throws.
  if (device == null) {
    return (
      <View style={[styles.fill, styles.centred]}>
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }

  const failed = state.phase === 'failed';

  return (
    <View style={styles.fill}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        outputs={[photoOutput, faceDetectorOutput]}
        isActive={!isUploading}
        orientationSource="interface"
        // 'auto' mirrors the front camera, which flips yaw in the STORED frames
        // while the detector reads the unmirrored stream. The server then
        // derives the opposite turn from the same movement and rejects it.
        // Pitch survives a horizontal flip, which is why only turns failed.
        mirrorMode="off"
      />

      <View style={styles.header}>
        <Text style={styles.title}>{labels.title}</Text>
        <Text style={styles.subtitle}>{labels.progress(state.index + 1, actions.length)}</Text>
      </View>

      <View style={styles.promptArea}>
        <Text style={styles.prompt}>{labels.prompt(state)}</Text>
        {!faceVisible && !failed && <Text style={styles.hint}>{labels.noFace}</Text>}
      </View>

      <View style={styles.footer}>
        {isUploading ? (
          <ActivityIndicator color={theme.text} />
        ) : failed ? (
          <TouchableOpacity style={styles.button} onPress={onRetry}>
            <Text style={styles.buttonText}>{labels.tryAgain}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={onCancel} disabled={isUploading} style={styles.cancel}>
          <Text style={styles.cancelText}>{labels.cancel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Message({
  styles,
  title,
  body,
  action,
  onAction,
}: {
  styles: ReturnType<typeof makeStyles>;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <View style={[styles.fill, styles.centred, styles.padded]}>
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageBody}>{body}</Text>
      <TouchableOpacity style={styles.button} onPress={onAction}>
        <Text style={styles.buttonText}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

let lastSampleLoggedAt = 0;
function logSample(
  face: { yawAngle: number; pitchAngle: number } | undefined,
  previous: ChallengeState,
  next: ChallengeState,
) {
  const phaseChanged = previous.phase !== next.phase;
  const now = Date.now();
  if (!phaseChanged && now - lastSampleLoggedAt < 250) return;
  lastSampleLoggedAt = now;
  const pose = face ? `yaw=${face.yawAngle.toFixed(1)} pitch=${face.pitchAngle.toFixed(1)}` : 'no face';
  console.log(
    `[liveness] ${pose} | asked=${next.actions[next.index] ?? '-'} | ${previous.phase}` +
      (phaseChanged ? ` -> ${next.phase}` : '') +
      (next.failureReason ? ` (${next.failureReason})` : ''),
  );
}

function font(family: string | undefined, weight: TextStyle['fontWeight']): TextStyle {
  // A custom font carries its own weight; setting both makes Android pick a
  // synthetic bold of the wrong face.
  return family ? { fontFamily: family } : { fontWeight: weight };
}

function makeStyles(theme: LivenessTheme) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: theme.background },
    centred: { alignItems: 'center', justifyContent: 'center' },
    padded: { padding: 24 },
    header: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 56, paddingHorizontal: 24 },
    title: { color: theme.text, fontSize: 18, textAlign: 'center', ...font(theme.fontBold, '700') },
    subtitle: { color: theme.mutedText, fontSize: 14, textAlign: 'center', marginTop: 4, ...font(theme.fontRegular, '400') },
    promptArea: { position: 'absolute', left: 0, right: 0, top: '50%', alignItems: 'center', paddingHorizontal: 24 },
    prompt: { color: theme.text, fontSize: 24, textAlign: 'center', ...font(theme.fontBold, '700') },
    hint: { color: theme.mutedText, fontSize: 14, textAlign: 'center', marginTop: 12, ...font(theme.fontRegular, '400') },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 48, alignItems: 'center' },
    button: { backgroundColor: theme.buttonBackground, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
    buttonText: { color: theme.buttonText, fontSize: 16, ...font(theme.fontMedium ?? theme.fontBold, '600') },
    cancel: { marginTop: 24 },
    cancelText: { color: theme.text, fontSize: 14, ...font(theme.fontMedium, '500') },
    messageTitle: { color: theme.text, fontSize: 18, textAlign: 'center', marginBottom: 8, ...font(theme.fontBold, '600') },
    messageBody: { color: theme.mutedText, fontSize: 14, textAlign: 'center', marginBottom: 32, ...font(theme.fontRegular, '400') },
  });
}
