import { createKYCClient, requiresLivenessChallenge } from '@bipdelivery/core';
import type { KYCCore, VerificationSession } from '@bipdelivery/core';
import { KYC_CREDENTIALS } from '../constants/kyc';

export interface Session {
  /** Token-scoped client: the only one the screens use. */
  client: KYCCore;
  verificationId: string;
  /** The project's flow asks for the challenge rather than a plain selfie. */
  livenessRequired: boolean;
  session: VerificationSession;
}

/**
 * Starts a verification and returns a client scoped to it.
 *
 * **In your app, the first half of this belongs on your server.** Minting a
 * token needs the project API key, and that key can start and read every
 * verification in the project — an app bundle is readable, so a key shipped in
 * one is a key anyone with the APK can use, on your bill. Your backend should
 * expose something like `POST /kyc/session` that does these two calls and
 * returns `{ token, verificationId }`.
 *
 * The example does both here only because it has no backend of its own, and it
 * reads the key from the environment so none is committed.
 */
export async function startSession(externalId?: string): Promise<Session> {
  if (!KYC_CREDENTIALS.apiKey) {
    throw new Error(
      'No API key. Copy .env.example to .env.local and set EXPO_PUBLIC_KYC_API_KEY.',
    );
  }

  const serverSide = createKYCClient(KYC_CREDENTIALS);
  const reference = externalId ?? `example-${Date.now()}`;

  const { token } = await serverSide.createVerificationToken(reference, '1');
  const session = await serverSide.startVerification({
    documentType: 'IDENTITY_CARD',
    country: 'MZ',
    externalId: reference,
  });

  // What a real client receives: the token and the id, and no API key.
  const client = createKYCClient({
    apiKey: '',
    baseUrl: KYC_CREDENTIALS.baseUrl,
    verificationToken: token,
  });

  return {
    client,
    verificationId: session.verificationId,
    // The server decides this, not the app: a liveness flow rejects a plain
    // selfie, and a selfie flow has no challenge to draw.
    livenessRequired: requiresLivenessChallenge(session),
    session,
  };
}
