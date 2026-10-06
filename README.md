# @bipdelivery KYC SDK

Client packages for **kyc-mz**, the BipDelivery identity verification API:
start a verification, capture the documents and the selfie, run the active
liveness challenge, and follow the result.

## Packages

| Package | For | What it is |
|---|---|---|
| [`@bipdelivery/core`](./packages/core/README.md) | Any JS runtime | The API client (sessions, uploads, status, resume) and the liveness challenge machine. No UI. Published on npm. |
| [`@bipdelivery/react-native`](./packages/react-native/README.md) | React Native (bare or Expo dev build) | `LivenessCapture` and `LivenessStep` on VisionCamera. |
| `@bipdelivery/web` | Browsers (React) | `KYCWeb`, the full web flow, and `LivenessCapture` on MediaPipe ([LIVENESS.md](./packages/web/LIVENESS.md)). |
| [`@bipdelivery/example`](./apps/example/README.md) | — | Expo example app using core and react-native. Not published. |

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
