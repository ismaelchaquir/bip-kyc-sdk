import type { ChallengeState } from '@bipdelivery/core';
import { promptFor } from '@bipdelivery/core';

/**
 * How the capture screen looks. Everything is optional; an app passes its own
 * palette and fonts so the challenge reads as part of the app, not as a
 * third-party screen dropped into it.
 */
export interface LivenessTheme {
  /** Behind the camera, and on the permission / unavailable screens. */
  background: string;
  text: string;
  /** Hints and secondary lines. */
  mutedText: string;
  buttonBackground: string;
  buttonText: string;
  fontRegular?: string;
  fontMedium?: string;
  fontBold?: string;
}

export const defaultTheme: LivenessTheme = {
  background: '#141414',
  text: '#FFFFFF',
  mutedText: 'rgba(255,255,255,0.7)',
  buttonBackground: '#FFFFFF',
  buttonText: '#141414',
};

/** Every string on the screen, for translation. */
export interface LivenessLabels {
  title: string;
  progress: (current: number, total: number) => string;
  /** The instruction for the current phase ("Slowly turn your head left"). */
  prompt: (state: ChallengeState) => string;
  noFace: string;
  permissionTitle: string;
  permissionBody: string;
  unavailableTitle: string;
  unavailableBody: string;
  goBack: string;
  tryAgain: string;
  cancel: string;
}

export const defaultLabels: LivenessLabels = {
  title: 'Liveness check',
  progress: (current, total) => `${current} of ${total}`,
  prompt: promptFor,
  noFace: 'Move somewhere brighter and centre your face',
  permissionTitle: 'Camera access needed',
  permissionBody: 'Enable camera access in Settings to continue identity verification.',
  unavailableTitle: 'Camera unavailable',
  unavailableBody: 'We could not open the front camera on this phone.',
  goBack: 'Go back',
  tryAgain: 'Try again',
  cancel: 'Cancel',
};
