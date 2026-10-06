# @bipdelivery/web

Browser capture for [kyc-mz](https://github.com/ismaelchaquir/bip-kyc-api): the
active liveness challenge and the full web verification flow, on MediaPipe.

The rules — the challenge machine, the sign conventions, the thresholds — live in
[`@bipdelivery/core`](https://www.npmjs.com/package/@bipdelivery/core) and are shared
with the React Native package. This package is only the browser side: turning a
`<video>` stream into head poses and stills.

```bash
npm install @bipdelivery/web @bipdelivery/core
```

```tsx
import { createKYCClient } from '@bipdelivery/core';
import { LivenessCapture } from '@bipdelivery/web';

const client = createKYCClient({ baseURL, token });
const challenge = await client.createLivenessChallenge(verificationId);

<LivenessCapture
  challenge={challenge}
  onComplete={(evidence) =>
    client.uploadSelfie({ verificationId, imageData: evidence.frames[0], liveness: evidence })
  }
  onFailed={() => {
    /* offer a retry — draw a new challenge, never replay the spent one */
  }}
/>;
```

`KYCWeb` runs the whole flow — it starts the verification, asks for the selfie
and each side of the document, waits for the decision and reports it — if you
want the screens as well as the camera:

```tsx
<KYCWeb
  config={{
    baseUrl,
    verificationToken,  // minted by your backend; never ship the API key here
    documentType: 'IDENTITY_CARD',
    country: 'MZ',
    externalUserId: user.id,
    locale: 'pt',
    onComplete: (status) => router.push(status === 'approved' ? '/done' : '/retry'),
  }}
/>
```

Both approaches are in the playground: `pnpm playground` serves the core-driven
page at `/`, and the managed flow at `/managed.html`. Mint a session for either
with `scripts/new-liveness-session.sh`.

## What this is, and is not

Coaching and frame selection. **Not** a security boundary: kyc-mz re-derives head
pose from the submitted frames with InsightFace and makes its own decision, so a
client that lies about having completed a challenge is caught server-side.
[LIVENESS.md](./LIVENESS.md) explains the protocol and what the server checks.

Peer dependencies: React and React DOM 18 or newer. Camera access needs a secure
context (HTTPS or localhost).
