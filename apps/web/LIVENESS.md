# Active liveness (web)

Browser equivalent of the driver app's challenge flow. The applicant is asked to
perform head movements a server-issued challenge names, and the frames where
they did so are submitted as evidence.

```tsx
import { LivenessCapture } from '@kyciris/web';

const challenge = await client.createLivenessChallenge(verificationId);

<LivenessCapture
  challenge={challenge}
  onComplete={(evidence) =>
    client.uploadSelfie({ verificationId, imageData: evidence.frames[0], liveness: evidence })
  }
  onFailed={(reason) => /* offer a retry — a new challenge, not the same one */}
/>
```

## What this is, and is not

It is **coaching and frame selection**. It is not a security boundary.

kyc-mz re-derives head pose from the submitted frames with insightface and makes
the actual decision. Everything in this package runs in a browser the attacker
controls, so the client's verdict is advisory — recorded for diagnostics, and a
mismatch between it and the frames is itself a useful fraud signal.

The action sequence must come from the server for the same reason. A client that
picks its own offers no replay protection: an attacker would choose the sequence
matching a clip they already hold.

## Self-host the model and WASM before production

The defaults point at jsDelivr and Google's model storage, which is what every
MediaPipe sample does and the wrong default here. A KYC capture that fetches
from a third-party CDN tells whoever runs that CDN that a given user is being
verified, right now — and stops working entirely when they have an outage.

Both ship inside `@mediapipe/tasks-vision`. Copy them to your own origin:

```bash
cp -r node_modules/@mediapipe/tasks-vision/wasm public/mediapipe/wasm
# the model is a separate download, pinned to a version you have tested
curl -o public/mediapipe/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

```tsx
<LivenessCapture
  challenge={challenge}
  detector={{
    wasmPath: '/mediapipe/wasm',
    modelAssetPath: '/mediapipe/face_landmarker.task',
  }}
  onComplete={…}
/>
```

## The sign convention

`@bipdelivery/core`'s challenge machine defines `+yaw` as the head turning to
the applicant's **own left**, and `+pitch` as the chin lifting. Every pose source
must meet that contract, because the server applies the same rule to the frames.

Getting it backwards is the worst available failure: "turn left" passes in the
browser and fails server-side, which reads to the applicant as a random
rejection rather than as something they did wrong.

Two things make it easy to get backwards:

- MediaPipe, ML Kit and insightface make no promise of agreeing on which
  direction is positive.
- A front-camera preview is mirrored, which reverses yaw again. `pose.ts` undoes
  that (`mirrored: true`, the default) — pass `mirrored: false` if you render
  the video unflipped.

`challenge-integration.spec.ts` asserts the whole chain: a matrix for a head
turned one way must satisfy `turn_left` and must NOT satisfy it when turned the
other. **Verify it once against a real webcam anyway** — the tests prove the math
is self-consistent, not that MediaPipe's axes are what we assume.

## Captured frames are not mirrored

The preview is flipped so the applicant sees a mirror; `capture()` deliberately
does not flip. The server matches these frames against a document photo, and a
mirrored face is a different face to a matcher.
