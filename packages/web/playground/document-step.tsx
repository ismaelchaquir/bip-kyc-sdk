import React, { useCallback, useRef, useState } from 'react';

/**
 * Document capture.
 *
 * A file input with `capture="environment"` rather than a custom camera, and
 * deliberately so. The native camera app gives full sensor resolution,
 * autofocus, tap-to-focus and a review screen — all of which matter enormously
 * for OCR and MRZ, and none of which a getUserMedia preview provides. A
 * `<video>` frame grab is typically 720p and soft, which is exactly how MRZ
 * checksums start failing.
 *
 * The liveness step is the opposite case: it needs a live frame stream to run
 * pose detection over, so it uses getUserMedia. Different jobs, different tools.
 */
export function DocumentStep({
  label,
  hint,
  onCaptured,
  busy,
}: {
  label: string;
  hint: string;
  onCaptured: (dataUri: string) => void;
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      setError(null);

      const reader = new FileReader();
      reader.onerror = () => setError('Could not read that image.');
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : null;
        if (!result) {
          setError('Could not read that image.');
          return;
        }
        setPreview(result);
      };
      // A data URI, which is what the SDK's upload path takes.
      reader.readAsDataURL(file);
    },
    [],
  );

  return (
    <section>
      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{label}</h2>
      <p style={{ opacity: 0.65, fontSize: 13, margin: '0 0 12px' }}>{hint}</p>

      {preview ? (
        <>
          <img
            src={preview}
            alt={label}
            style={{ width: '100%', borderRadius: 12, marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                setPreview(null);
                inputRef.current?.click();
              }}
              disabled={busy}
              style={secondary}
            >
              Retake
            </button>
            <button
              onClick={() => onCaptured(preview)}
              disabled={busy}
              style={primary}
            >
              {busy ? 'Uploading…' : 'Use this photo'}
            </button>
          </div>
        </>
      ) : (
        <button onClick={() => inputRef.current?.click()} style={primary}>
          Take photo
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        // Opens the rear camera directly on a phone. Desktop browsers ignore it
        // and show a file picker, which is the sensible fallback.
        capture="environment"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {error && (
        <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>
      )}
    </section>
  );
}

const primary: React.CSSProperties = {
  flex: 1,
  padding: 14,
  borderRadius: 12,
  border: 0,
  background: '#F5C33B',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
};

const secondary: React.CSSProperties = {
  flex: 1,
  padding: 14,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'transparent',
  color: '#fff',
  font: 'inherit',
  cursor: 'pointer',
};
