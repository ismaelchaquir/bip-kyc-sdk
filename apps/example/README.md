# @bipdelivery/example

An Expo app that runs a verification end to end against kyc-mz with the SDK
packages: create a session, photograph both sides of the document, then the
selfie. When the project's flow requires it, the selfie goes through
`LivenessStep` from `@bipdelivery/react-native`.

## Run

VisionCamera is native, so this needs a **development build**, not Expo Go.

```bash
cp .env.example .env.local   # then set EXPO_PUBLIC_KYC_API_KEY (and the URL for a local stack)
pnpm install                 # from the sdk-kyc root
pnpm --filter @bipdelivery/core build   # the example imports core's build
cd apps/example
npx expo run:android         # or run:ios
```

The API key is a project key from the kyc-mz dashboard. There is none in the
source, by design (`constants/kyc.ts`).

## Screens

`token-step` → `front-document` → `back-document` → `selfie-step` → `verification-complete`.
