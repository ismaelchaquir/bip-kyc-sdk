import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { KYCWeb } from '../src/index';

/**
 * The managed flow: `KYCWeb` runs the whole verification.
 *
 * The sibling page (index.html, main.tsx) is the other half of the comparison —
 * the same verification driven call by call with `@bipdelivery/core`, with the
 * page owning each step. Here the component owns all of it: it starts the
 * verification, asks for the selfie, then each side of the document, waits for
 * the decision, and reports it through `onComplete`.
 *
 * Use this when the page has nothing to add: a link sent to an applicant by SMS,
 * an onboarding step in someone else's product, a back-office tool. Use core
 * directly when the surrounding product has its own screens, copy and states to
 * fit the flow into.
 *
 * Credentials work exactly as they do on the other page: the project API key
 * never reaches the browser, and the session arrives as a verification token in
 * the URL **hash**, which is not sent to the server and not forwarded in a
 * Referer header. Mint one with `scripts/new-liveness-session.sh`.
 *
 * NOTE: `KYCWeb` starts its own verification from the token, so the
 * `verificationId` in the hash is ignored here — a token is scoped to a project
 * and an applicant reference, not to one verification.
 */

const API_BASE = import.meta.env.VITE_KYC_API_BASE ?? 'https://api.kyc.bipdelivery.com';

function readToken(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('token');
}

function App() {
  const token = useMemo(readToken, []);

  if (!token) {
    return (
      <main style={styles.pad}>
        <h1 style={styles.h1}>No session</h1>
        <p style={styles.p}>
          This page needs a verification token. Mint one and open the URL it prints:
        </p>
        <pre style={styles.pre}>KYC_API_KEY=sk_… ./scripts/new-liveness-session.sh</pre>
        <p style={styles.p}>
          Then replace <code>/liveness/</code> with <code>/liveness/managed.html</code> in that URL,
          keeping the <code>#token=…</code> part.
        </p>
      </main>
    );
  }

  return (
    <KYCWeb
      config={{
        baseUrl: API_BASE,
        verificationToken: token,
        documentType: 'IDENTITY_CARD',
        country: 'MZ',
        // The reference your product knows the applicant by. It comes back on
        // the webhook, which is how your backend ties a decision to a user.
        externalUserId: 'playground',
        locale: 'pt',
        onStatusChanged: (event) => console.log('[kyc] status', event),
        onComplete: (status, error) => console.log('[kyc] complete', status, error ?? ''),
        onError: (error) => console.warn('[kyc] error', error),
      }}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  pad: { padding: 24 },
  h1: { fontSize: 22, margin: '0 0 12px' },
  p: { color: '#B6BDCC', lineHeight: 1.6 },
  pre: {
    background: '#151922',
    padding: 12,
    borderRadius: 8,
    overflowX: 'auto',
    fontSize: 13,
  },
};

createRoot(document.getElementById('root')!).render(<App />);
