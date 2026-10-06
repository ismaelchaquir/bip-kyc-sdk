# @bipdelivery/react-native

The kyc-mz active liveness check for React Native apps, on VisionCamera.

The rules (challenge machine, pose sign convention, thresholds) live in
`@bipdelivery/core`, shared with the web SDK. This package is only the camera
side: turning the front camera into head poses and the stills the server
verifies.

## Install

Peer dependencies (native — the app must be rebuilt, and Expo apps need a
development build, not Expo Go):

```
@bipdelivery/core >= 0.4.0
react-native-vision-camera >= 5.1.1
react-native-vision-camera-face-detector >= 2.0.6
react-native-nitro-modules, react-native-nitro-image
```

Declare the camera permission: `android.permission.CAMERA` and
`NSCameraUsageDescription` (VisionCamera v5 has no Expo config plugin; see
`apps/example/app.json`).

## Use

### The whole step

For apps that don't manage verification state themselves:

```tsx
import { createKYCClient, requiresLivenessChallenge } from '@bipdelivery/core';
import { LivenessStep } from '@bipdelivery/react-native';

const session = await client.startVerification({ documentType: 'IDENTITY_CARD', country: 'MZ' });

if (requiresLivenessChallenge(session)) {
  <LivenessStep
    client={client}
    verificationId={session.verificationId}
    onUploaded={() => navigate('done')}
    onCancel={goBack}
  />
}
```

It draws a challenge, runs the capture, uploads the selfie with its frames, and
draws a fresh challenge for every retry. Challenges are single-use.

### Just the capture

For apps with their own state (the driver app keeps it in its store):

```tsx
<LivenessCapture
  key={challenge.id}            // a new challenge remounts: frames and state reset
  actions={challenge.actions}
  challengeId={challenge.id}
  isUploading={uploading}
  onComplete={(selfieUri, frameUris, report) =>
    client.uploadSelfie({ verificationId, imageData: selfieUri, liveness: { frames: frameUris, report } })
  }
  onRetry={drawNewChallenge}
  onCancel={goBack}
/>
```

### Look and language

```tsx
<LivenessCapture
  theme={{ background: '#141414', mutedText: '#B8B8B8', fontBold: 'Poppins-Bold' }}
  labels={{ title: 'Prova de vida', cancel: 'Cancelar', prompt: (state) => promptPt(state) }}
  debug={__DEV__}   // logs yaw/pitch, for checking sign conventions on a new phone
  …
/>
```

## What the server needs, and why the capture looks like this

kyc-mz re-derives head pose from the uploaded frames and decides for itself;
the on-device result only coaches the applicant and picks when to shoot.

- **Two frames per movement**, 300 ms apart, taken as the movement is first
  satisfied, plus one at each return to centre, then the selfie head-on
  (`capture-plan.ts`). A frame taken after the head came back shows no
  movement and gets a genuine applicant rejected.
- **One capture at a time, in order** (`capture-queue.ts`). Dropped overlapping
  captures lost evidence; a selfie racing a movement capture lost a passed
  challenge.
- **`mirrorMode="off"`**. A mirrored preview flips yaw in the stored frames and
  the server reads every turn backwards.
- **A stable face-detector output**. A new one per render reconfigures the
  camera session and aborts captures in flight.

## Develop

```bash
pnpm --filter @bipdelivery/react-native typecheck
pnpm --filter @bipdelivery/react-native test     # capture plan and queue
```

### Using it from an app in this repo, before it is published

```bash
sdk-kyc/scripts/pack-local.sh            # packs core + react-native into .local-packages/
cd driver && yarn upgrade @bipdelivery/core @bipdelivery/react-native
```

The driver depends on `file:../sdk-kyc/.local-packages/*.tgz`. Once these
versions are published to npm, switch it back to version ranges.
