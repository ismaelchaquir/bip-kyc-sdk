import React, { useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { LivenessAction, LivenessChallenge, LivenessEvidence } from '@bipdelivery/core';
import { LivenessCapture } from '../src/liveness/liveness-capture';

/**
 * Manual test harness for the liveness capture.
 *
 * Fakes the one thing that must come from a server in production — the
 * challenge — so the camera, the pose extraction and the challenge machine can
 * be exercised without a KYC backend. Everything below the challenge is the
 * real code path.
 *
 * A real client calls `KYCClient.createLivenessChallenge(verificationId)`; a
 * client that picks its own sequence offers no replay protection, which is why
 * this is a playground and not an example to copy.
 */

const ALL_ACTIONS: LivenessAction[] = ['turn_left', 'turn_right', 'look_up', 'look_down'];

function fakeChallenge(actions: LivenessAction[]): LivenessChallenge {
  return {
    id: `local-${Date.now()}`,
    actions,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

function App() {
  const [actions, setActions] = useState<LivenessAction[]>(['turn_left', 'turn_right']);
  const [challenge, setChallenge] = useState<LivenessChallenge | null>(null);
  const [result, setResult] = useState<
    { ok: true; evidence: LivenessEvidence } | { ok: false; reason: string } | null
  >(null);

  const start = useCallback(() => {
    setResult(null);
    setChallenge(fakeChallenge(actions));
  }, [actions]);

  const toggle = (action: LivenessAction) =>
    setActions((current) =>
      current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action],
    );

  const summary = useMemo(() => {
    if (!result) return null;
    if (!result.ok) return `FAILED — ${result.reason}`;
    const { report, frames } = result.evidence;
    return [
      `PASSED`,
      `frames captured: ${frames.length}`,
      `actions: ${report.actions.join(' → ')}`,
      `timings (ms): ${report.timingsMs?.join(', ') ?? '—'}`,
    ].join('\n');
  }, [result]);

  return (
    <main>
      <h1 style={{ fontSize: 18 }}>Liveness playground</h1>

      {!challenge && (
        <>
          <p style={{ opacity: 0.7, fontSize: 13 }}>
            Pick the movements, then start. The challenge is faked locally — in
            production it comes from the server.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
            {ALL_ACTIONS.map((action) => (
              <button
                key={action}
                onClick={() => toggle(action)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,.2)',
                  background: actions.includes(action) ? '#F5C33B' : 'transparent',
                  color: actions.includes(action) ? '#000' : '#fff',
                  font: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {action.replace('_', ' ')}
              </button>
            ))}
          </div>
          <button
            onClick={start}
            disabled={actions.length === 0}
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 12,
              border: 0,
              background: '#F5C33B',
              font: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Start challenge
          </button>
        </>
      )}

      {challenge && (
        <LivenessCapture
          key={challenge.id}
          challenge={challenge}
          onComplete={(evidence) => {
            setResult({ ok: true, evidence });
            setChallenge(null);
          }}
          onFailed={(reason) => {
            setResult({ ok: false, reason });
            setChallenge(null);
          }}
          // Point these at self-hosted copies to test the production path;
          // unset they fall back to the CDN. See LIVENESS.md.
          // detector={{ wasmPath: '/mediapipe/wasm', modelAssetPath: '/mediapipe/face_landmarker.task' }}
        />
      )}

      {summary && (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            background: 'rgba(255,255,255,.06)',
            padding: 12,
            borderRadius: 12,
            fontSize: 13,
          }}
        >
          {summary}
        </pre>
      )}

      {/* The frames are the actual evidence the server judges, so being able to
          look at them is most of the point of testing this by hand. */}
      {result?.ok && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {result.evidence.frames.map((frame, i) => (
            <img key={i} src={frame} alt={`frame ${i + 1}`} style={{ width: 100, borderRadius: 8 }} />
          ))}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
