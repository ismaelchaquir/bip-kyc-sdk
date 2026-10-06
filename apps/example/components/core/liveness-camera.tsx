import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { createFaceDetectorOutput } from 'react-native-vision-camera-face-detector';
import { advance, createChallengeState, promptFor } from '@bipdelivery/core';
import type { ChallengeState, ClientChallengeReport, LivenessAction } from '@bipdelivery/core';

export interface LivenessCameraProps {
  actions: LivenessAction[];
  challengeId: string;
  uploading: boolean;
  onComplete: (selfieUri: string, frameUris: string[], report: ClientChallengeReport) => void;
  onRetry: () => void;
  onCancel: () => void;
}

/**
 * The challenge, coached by the app's own UI.
 *
 * This is what `@bipdelivery/react-native` does, written out, because the point
 * of the example is that the rules do NOT have to be rewritten: the state
 * machine, the thresholds and the sign convention come from
 * `@bipdelivery/core`, which is the same code the web SDK drives and the only
 * reason a client and the server agree about what "turn left" means.
 *
 * What the app supplies is the camera, the prompts, and when to take a frame.
 * Three things are easy to get wrong here, and each one rejects applicants who
 * did nothing wrong:
 *
 *  1. `mirrorMode="off"`. The front camera's preview is mirrored; if the stored
 *     frames are too, the server derives the opposite turn from the same
 *     movement. Pitch survives a flip, which is why only turns fail.
 *  2. Frames must be taken AS the movement is satisfied, not after the head
 *     comes back to centre — a "turn left" frame of a centred face proves
 *     nothing, and is rejected.
 *  3. The pose fed in must be +yaw when the head turns to the applicant's left
 *     and +pitch when the chin lifts. ML Kit happens to match; another detector
 *     must be calibrated before it is trusted.
 *
 * The verdict here only drives the UI. kyc-mz re-derives pose from the uploaded
 * frames with InsightFace and decides for itself.
 */
const FRAMES_PER_MOVEMENT = 2;
const FOLLOW_UP_FRAME_MS = 300;

export function LivenessCamera({
  actions,
  challengeId,
  uploading,
  onComplete,
  onRetry,
  onCancel,
}: LivenessCameraProps) {
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const [state, setState] = useState<ChallengeState>(() => createChallengeState(actions));
  const [faceVisible, setFaceVisible] = useState(false);

  // Frames live in a ref: re-rendering on every capture would drop detections
  // in the middle of a movement, which is exactly when they matter.
  const framesRef = useRef<string[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const finishedRef = useRef(false);

  const photoOutput = usePhotoOutput({
    // Pose estimation does not need 4K, and a big still stalls the challenge.
    targetResolution: CommonResolutions.FHD_4_3,
    containerFormat: 'jpeg',
    quality: 0.8,
    qualityPrioritization: 'speed',
  });

  const shoot = async (): Promise<string | null> => {
    try {
      const file = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      return `file://${file.filePath}`;
    } catch (error) {
      console.warn('[liveness] capture failed', error);
      return null;
    }
  };

  /**
   * The detector handler goes through a ref so the output object stays stable.
   * Rebuilding it reconfigures the camera session and aborts any capture in
   * flight — and this screen re-renders on every pose sample, so a handler
   * passed inline loses every frame.
   */
  const onFacesRef = useRef<(faces: { yawAngle: number; pitchAngle: number }[]) => void>(() => {});
  const faceDetector = useMemo(
    () =>
      createFaceDetectorOutput({
        performanceMode: 'fast',
        runLandmarks: false,
        runContours: false,
        runClassifications: false,
        cameraFacing: 'front',
        onFacesDetected: (faces) => onFacesRef.current(faces),
        onError: (error) => console.warn('[liveness] detection failed', error),
      }),
    [],
  );

  onFacesRef.current = (faces) => {
    const previous = stateRef.current;
    if (finishedRef.current || previous.phase === 'done' || previous.phase === 'failed') return;

    const face = faces[0];
    setFaceVisible(!!face);

    const next = advance(previous, face ? { yaw: face.yawAngle, pitch: face.pitchAngle } : null);
    if (next === previous) return;

    // The movement was just satisfied: take the frames that prove it, while the
    // head is still past the threshold.
    if (previous.phase === 'awaiting_action' && next.phase === 'returning') {
      void (async () => {
        for (let taken = 0; taken < FRAMES_PER_MOVEMENT; taken += 1) {
          const uri = await shoot();
          if (uri) framesRef.current.push(uri);
          if (taken + 1 < FRAMES_PER_MOVEMENT) {
            await new Promise((resolve) => setTimeout(resolve, FOLLOW_UP_FRAME_MS));
          }
        }
      })();
    } else if (previous.phase === 'returning' && next.phase !== 'returning') {
      // Back to centre. The server wants to see the same face forward as well as
      // turned — that is what rules out a photo held at an angle.
      void shoot().then((uri) => {
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

  // Finishing is a side effect of reaching `done`, so the last capture can be
  // awaited instead of racing the ones still running.
  useEffect(() => {
    if (state.phase !== 'done' || finishedRef.current) return;
    finishedRef.current = true;

    void (async () => {
      const selfie = await shoot();
      if (!selfie) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  if (!hasPermission) {
    return (
      <View style={styles.centred}>
        <Text style={styles.heading}>Camera access needed</Text>
        <TouchableOpacity style={styles.button} onPress={onCancel}>
          <Text style={styles.buttonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const failed = state.phase === 'failed';

  return (
    <View style={styles.fill}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        outputs={[photoOutput, faceDetector]}
        isActive={!uploading}
        orientationSource="interface"
        mirrorMode="off"
      />

      <View style={styles.header} pointerEvents="none">
        <Text style={styles.step}>
          Movement {Math.min(state.index + 1, actions.length)} of {actions.length}
        </Text>
        <Text style={styles.prompt}>{promptFor(state)}</Text>
        {!faceVisible && !failed ? <Text style={styles.warn}>No face in frame</Text> : null}
      </View>

      <View style={styles.oval} pointerEvents="none" />

      <View style={styles.footer}>
        {uploading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.status}>Sending the frames…</Text>
          </View>
        ) : failed ? (
          <TouchableOpacity style={styles.button} onPress={onRetry}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.status}>Move slowly, and come back to centre each time.</Text>
        )}
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  centred: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  header: { position: 'absolute', top: 64, left: 24, right: 24, gap: 6 },
  step: { color: '#9CA3AF', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  prompt: { color: '#fff', fontSize: 24, fontWeight: '700' },
  warn: { color: '#FBBF24', fontSize: 14 },
  heading: { color: '#fff', fontSize: 20, fontWeight: '700' },
  oval: {
    position: 'absolute',
    alignSelf: 'center',
    top: '26%',
    width: '66%',
    aspectRatio: 0.75,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  footer: { position: 'absolute', left: 24, right: 24, bottom: 52, alignItems: 'center', gap: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { color: '#D1D5DB', fontSize: 14, textAlign: 'center' },
  button: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  cancel: { color: '#9CA3AF', fontSize: 14 },
});
