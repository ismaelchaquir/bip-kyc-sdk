import React, { useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createKYCClient,
  type LivenessChallenge,
  type LivenessEvidence,
} from '@bipdelivery/core';
import { LivenessCapture } from '../src/liveness/liveness-capture';
import { DocumentStep } from './document-step';

/**
 * Hosted liveness test page.
 *
 * Runs the real thing: a real challenge from the real gateway, real frames
 * uploaded back to it. Nothing here is faked, which is the point — a challenge
 * invented in the browser proves the camera works and nothing about whether the
 * server agrees, and the server disagreeing is the failure that matters.
 *
 * THE API KEY IS NOT HERE, AND MUST NOT BE. This page is served publicly, so
 * anything in its bundle is readable by anyone who finds the URL, and the
 * project API key is project-wide and long-lived — it can start verifications,
 * read them, and mint tokens for any applicant. `POST /verification/token` is
 * guarded by ApiKeyOnlyGuard precisely so that minting happens off the client.
 *
 * Instead the page is handed a VERIFICATION TOKEN: short-lived (hours), scoped
 * to one verification, and enough for exactly the two calls this flow makes.
 * `scripts/new-liveness-session.sh` mints one and prints the URL to open.
 *
 * The session arrives in the URL **hash**, not the query string. A hash is
 * never sent to the server, so it stays out of access logs, and it is not
 * forwarded in the Referer header to anything the page loads.
 */

const API_BASE =
  import.meta.env.VITE_KYC_API_BASE ?? 'https://api.kyc.bipdelivery.com';

interface Session {
  token: string;
  verificationId: string;
}

/** `#token=…&verificationId=…`, as the session script emits it. */
function readSession(): Session | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const token = params.get('token');
  const verificationId = params.get('verificationId');
  return token && verificationId ? { token, verificationId } : null;
}

/**
 * The project's flow is `document_liveness`, so the page walks both steps in
 * that order — the same order the driver app uses, and the order the gateway
 * expects: a liveness selfie with no document behind it has nothing to be
 * matched against.
 */
type Phase =
  | { kind: 'no-session' }
  | { kind: 'doc-front' }
  | { kind: 'doc-back' }
  | { kind: 'requesting' }
  | { kind: 'challenge'; challenge: LivenessChallenge }
  | { kind: 'uploading' }
  | { kind: 'done'; frames: number }
  | { kind: 'error'; message: string };

function App() {
  const session = useMemo(readSession, []);
  const [phase, setPhase] = useState<Phase>(
    session ? { kind: 'doc-front' } : { kind: 'no-session' },
  );
  const [busy, setBusy] = useState(false);

  /**
   * One client for the page's lifetime, credentialed by the token alone:
   * `createVerificationToken` is never called here, because minting a token
   * needs the API key this page deliberately does not have.
   */
  const client = useMemo(
    () =>
      session
        ? createKYCClient({
            apiKey: '',
            baseUrl: API_BASE,
            verificationToken: session.token,
          })
        : null,
    [session],
  );

  const requestChallenge = useCallback(async () => {
    if (!client || !session) return;
    setPhase({ kind: 'requesting' });
    try {
      const challenge = await client.createLivenessChallenge(session.verificationId);
      setPhase({ kind: 'challenge', challenge });
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not get a challenge',
      });
    }
  }, [client, session]);

  const uploadDoc = useCallback(
    async (type: 'front' | 'back', imageData: string, next: Phase) => {
      if (!client || !session) return;
      setBusy(true);
      try {
        await client.uploadDocument({
          verificationId: session.verificationId,
          type,
          imageData,
        });
        setBusy(false);
        setPhase(next);
        // The challenge is requested only once the documents are in, because it
        // expires in two minutes — asking for it earlier means it is dead
        // before the applicant has finished photographing their ID.
        if (next.kind === 'requesting') requestChallenge();
      } catch (err) {
        setBusy(false);
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : `Could not upload the ${type}`,
        });
      }
    },
    [client, session, requestChallenge],
  );

  const submit = useCallback(
    async (evidence: LivenessEvidence, selfie: string) => {
      if (!client || !session) return;
      setPhase({ kind: 'uploading' });
      try {
        await client.uploadSelfie({
          verificationId: session.verificationId,
          // The straightest frame the capture saw, chosen by it — not
          // frames[0], which is the first extreme of the first movement. All
          // the frames still ride along as evidence and the server re-derives
          // pose from every one of them.
          imageData: selfie,
          liveness: evidence,
        });
        setPhase({ kind: 'done', frames: evidence.frames.length });
      } catch (err) {
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    },
    [client, session],
  );

  if (phase.kind === 'no-session') {
    return (
      <main>
        <h1 style={{ fontSize: 18 }}>Liveness test</h1>
        <p style={{ opacity: 0.75, fontSize: 14 }}>
          This page needs a verification session. Mint one and open the URL it
          prints:
        </p>
        <pre style={code}>
          ./scripts/new-liveness-session.sh
        </pre>
        <p style={{ opacity: 0.55, fontSize: 12 }}>
          The session goes in the URL hash. It is short-lived and scoped to a
          single verification — the project API key stays on the server.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1 style={{ fontSize: 18 }}>Liveness test</h1>
      <p style={{ opacity: 0.6, fontSize: 12, wordBreak: 'break-all' }}>
        {API_BASE} · {session!.verificationId}
      </p>
      {/* So a stale cached page is obvious on the device rather than looking
          like a fix that did not take. */}
      <p style={{ opacity: 0.45, fontSize: 11 }}>build {__BUILD_ID__}</p>

      {phase.kind === 'doc-front' && (
        <DocumentStep
          label="Front of your ID"
          hint="Fill the frame, avoid glare, and keep all four corners visible."
          busy={busy}
          onCaptured={(img) => uploadDoc('front', img, { kind: 'doc-back' })}
        />
      )}

      {phase.kind === 'doc-back' && (
        <DocumentStep
          label="Back of your ID"
          hint="The side with the machine-readable lines, if it has them."
          busy={busy}
          onCaptured={(img) => uploadDoc('back', img, { kind: 'requesting' })}
        />
      )}

      {phase.kind === 'requesting' && <p>Requesting a challenge…</p>}

      {phase.kind === 'challenge' && (
        <LivenessCapture
          key={phase.challenge.id}
          challenge={phase.challenge}
          onComplete={submit}
          onFailed={(reason) =>
            setPhase({ kind: 'error', message: `Challenge failed: ${reason}` })
          }
        />
      )}

      {phase.kind === 'uploading' && <p>Uploading frames…</p>}

      {phase.kind === 'done' && (
        <div style={box}>
          <strong>Submitted.</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>
            {phase.frames} frame{phase.frames === 1 ? '' : 's'} uploaded. The
            server scores it — check the KYC dashboard for the verdict, which is
            the only one that counts.
          </p>
        </div>
      )}

      {phase.kind === 'error' && (
        <div style={{ ...box, borderColor: '#f87171' }}>
          <strong style={{ color: '#f87171' }}>Error</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>{phase.message}</p>
        </div>
      )}

      {(phase.kind === 'done' || phase.kind === 'error') && (
        <button onClick={() => setPhase({ kind: 'doc-front' })} style={button}>
          {/* A NEW challenge, never a retry of the old one: re-requesting draws
              a fresh random sequence, which is what stops someone retrying
              until they draw one they have a recording of. */}
          Start over
        </button>
      )}
    </main>
  );
}

const code: React.CSSProperties = {
  background: 'rgba(255,255,255,.06)',
  padding: 12,
  borderRadius: 10,
  fontSize: 13,
  overflowX: 'auto',
};

const box: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.15)',
  borderRadius: 12,
  padding: 14,
  marginTop: 12,
};

const button: React.CSSProperties = {
  width: '100%',
  marginTop: 12,
  padding: 14,
  borderRadius: 12,
  border: 0,
  background: '#F5C33B',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
};

createRoot(document.getElementById('root')!).render(<App />);
