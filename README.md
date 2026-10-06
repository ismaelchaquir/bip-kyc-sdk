# @bipdelivery KYC SDK

Client packages for **kyc-mz**, the BipDelivery identity verification API:
start a verification, capture the documents and the selfie, run the active
liveness challenge, and follow the result.

## Packages

| Package | For | What it is |
|---|---|---|
| [`@bipdelivery/core`](./packages/core/README.md) | Any JS runtime | The API client (sessions, uploads, status, resume) and the liveness challenge machine. No UI. Published on npm. |
| [`@bipdelivery/react-native`](./packages/react-native/README.md) | React Native (bare or Expo dev build) | `LivenessCapture` and `LivenessStep` on VisionCamera. |
| [`@bipdelivery/web`](./packages/web/README.md) | Browsers (React) | `KYCWeb`, the full web flow, and `LivenessCapture` on MediaPipe ([LIVENESS.md](./packages/web/LIVENESS.md)). Published on npm. |
| [`@bipdelivery/example`](./apps/example/README.md) | — | Expo app with three integrations side by side. Not published. |

## Choosing an integration

| You want | Use | Example |
|---|---|---|
| The selfie step handled for you | `LivenessStep` | [`apps/example/app/step-example.tsx`](./apps/example/app/step-example.tsx) |
| The SDK's camera, your orchestration | `LivenessCapture` | [`apps/example/app/capture-example.tsx`](./apps/example/app/capture-example.tsx) |
| Your own UI end to end | `core` alone | [`apps/example/app/core-example.tsx`](./apps/example/app/core-example.tsx) |
| A web page you host | `KYCWeb` | `packages/web` playground, `/managed.html` |
| A web page with your own screens | `core` + `LivenessCapture` from web | `packages/web` playground, `index.html` |

## Credentials

Two of them, and the difference matters. The **project API key** (`sk_…`) can
start and read every verification in the project, so it belongs on your server
only. What a device or a browser gets is a **verification token**: short-lived,
scoped to one applicant, and enough for every call a capture flow makes.

```ts
// your backend, holding the key
const { token } = await server.createVerificationToken(userId, '1');

// the app or page, holding only the token
const client = createKYCClient({ apiKey: '', baseUrl, verificationToken: token });
```

The rules that decide a verification live on the server. These packages coach
the applicant and collect evidence; kyc-mz re-checks everything it receives.

## Develop

```bash
pnpm install
pnpm build        # core first, then everything that depends on it
pnpm typecheck
pnpm test         # every package's tests, then the old-name guard
```

`pnpm test` ends with `scripts/check-names.sh`, which fails if a name this
project no longer uses comes back into the source.

## Use from an app in this repo, before publishing

The driver app installs these packages as local tarballs:

```bash
scripts/pack-local.sh
cd ../driver && yarn upgrade @bipdelivery/core @bipdelivery/react-native
```

Why tarballs and not a folder link: see `scripts/pack-local.sh`.

## Release

See [RELEASING.md](./RELEASING.md).
