/**
 * @bipdelivery/react-native — kyc-mz capture for React Native apps.
 *
 * The rules (the challenge machine, sign conventions, thresholds) live in
 * @bipdelivery/core and are shared with the web SDK; this package is only the
 * VisionCamera side: turning camera frames into poses and stills.
 */
export { LivenessCapture } from './liveness-capture';
export type { LivenessCaptureProps } from './liveness-capture';
export { LivenessStep } from './liveness-step';
export type { LivenessStepProps } from './liveness-step';
export { useResolvedCameraDevice } from './use-camera-device';
export type { ResolvedCameraDevice } from './use-camera-device';
export { defaultLabels, defaultTheme } from './theme';
export type { LivenessLabels, LivenessTheme } from './theme';
export { captureFor, FOLLOW_UP_FRAME_MS, FRAMES_PER_MOVEMENT, MAX_FRAMES } from './capture-plan';
export type { CaptureRequest } from './capture-plan';
export { createCaptureQueue, recordMovement } from './capture-queue';
export type { CaptureQueue } from './capture-queue';
