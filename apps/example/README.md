# @bipdelivery/example

Three ways to integrate the same verification, side by side in one Expo app.
They differ only in who owns the selfie step; the server-side flow is identical
and so is the decision kyc-mz reaches.

| Example | Packages | Your code owns |
|---|---|---|
| `app/step-example.tsx` | core + react-native | Two callbacks. `LivenessStep` draws the challenge, captures, uploads and retries. |
| `app/capture-example.tsx` | core + react-native | Drawing the challenge, uploading the frames, and what a failure offers next. `LivenessCapture` is the camera. |
| `app/core-example.tsx` | core only | Everything you see: both cameras, the prompts, the waiting screen, the rejection screen. Core still supplies the API client and the challenge machine. |

The core-only example follows the flow shape of the izzo app — capture → look at
it → retake or submit → liveness → waiting for approval → approved or rejected —
with its own camera UI in `components/core/`.

## Run

VisionCamera is native, so this needs a **development build**, not Expo Go.

```bash
cp .env.example .env.local   # then set EXPO_PUBLIC_KYC_API_KEY (and the URL for a local stack)
pnpm install                 # from the sdk-kyc root
pnpm --filter @bipdelivery/core build   # the example imports core's build
cd apps/example
npx expo run:android         # or run:ios
```

## About that API key

`lib/session.ts` mints a verification token with a project API key and then runs
the flow on the token alone. **The first half belongs on your server.** A project
key can start and read every verification in the project, and anything in an app
bundle is readable by anyone holding the APK — so in your app, `POST
/verification/token` is called by your backend, and the app receives only
`{ token, verificationId }`.

The examples do both on the device because they have no backend of their own, and
they read the key from the environment so none is committed.

## Browsers

The web equivalents are in `packages/web`: `pnpm playground` serves the
core-driven page, and `/managed.html` the same flow run end to end by `KYCWeb`.
