import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createKYCClient,
  KYCStatusEvent,
} from '@bipdelivery/core';

export type DocumentType = 'IDENTITY_CARD' | 'DRIVING_LICENSE';

export interface PaytesyKYCWebTheme {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
}

export type KYCLocale = 'en' | 'pt';

export interface PaytesyKYCWebStrings {
  start?: string;
  selfieTitle?: string;
  selfieHint?: string;
  documentFrontTitle?: string;
  documentBackTitle?: string;
  documentHint?: string;
  capture?: string;
  retake?: string;
  confirm?: string;
  switchCamera?: string;
  uploadInstead?: string;
  processing?: string;
  approved?: string;
  rejected?: string;
  retry?: string;
  cameraError?: string;
}

export interface PaytesyKYCWebConfig {
  apiKey: string;
  baseUrl: string;
  documentType: DocumentType;
  country: string;
  externalUserId: string;
  locale?: KYCLocale;
  theme?: PaytesyKYCWebTheme;
  strings?: PaytesyKYCWebStrings;
  onStatusChanged?: (event: KYCStatusEvent) => void;
  onComplete?: (status: 'approved' | 'rejected' | 'error', error?: string) => void;
  onError?: (error: Error) => void;
}

export interface PaytesyKYCWebProps {
  config: PaytesyKYCWebConfig;
}

type Step =
  | 'idle'
  | 'selfie'
  | 'documentFront'
  | 'documentBack'
  | 'processing'
  | 'complete';

const STRINGS: Record<KYCLocale, PaytesyKYCWebStrings> = {
  en: {
    start: 'Start verification',
    selfieTitle: 'Take a selfie',
    selfieHint: 'Center your face in the oval',
    documentFrontTitle: 'Document — front',
    documentBackTitle: 'Document — back',
    documentHint: 'Place the document inside the frame',
    capture: 'Capture',
    retake: 'Retake',
    confirm: 'Confirm',
    switchCamera: 'Flip',
    uploadInstead: 'Upload from device',
    processing: 'Verifying…',
    approved: 'Approved',
    rejected: 'Rejected',
    retry: 'Retry',
    cameraError: 'Camera unavailable — use upload instead.',
  },
  pt: {
    start: 'Iniciar verificação',
    selfieTitle: 'Tirar uma selfie',
    selfieHint: 'Centre o rosto no oval',
    documentFrontTitle: 'Documento — frente',
    documentBackTitle: 'Documento — verso',
    documentHint: 'Coloque o documento na moldura',
    capture: 'Capturar',
    retake: 'Repetir',
    confirm: 'Confirmar',
    switchCamera: 'Virar',
    uploadInstead: 'Enviar do dispositivo',
    processing: 'A verificar…',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    retry: 'Tentar novamente',
    cameraError: 'Câmara indisponível — envie um ficheiro.',
  },
};

export function PaytesyKYCWeb({ config }: PaytesyKYCWebProps): React.ReactElement {
  const locale = config.locale ?? 'en';
  const t = { ...STRINGS[locale], ...(config.strings ?? {}) };
  const theme = config.theme ?? {};

  const [step, setStep] = useState<Step>('idle');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'approved' | 'rejected' | null>(null);

  const getClient = useCallback(
    () => createKYCClient({ apiKey: config.apiKey, baseUrl: config.baseUrl }),
    [config.apiKey, config.baseUrl],
  );

  // Steps depend on document type: driving license is single-sided.
  const steps: Step[] =
    config.documentType === 'DRIVING_LICENSE'
      ? ['selfie', 'documentFront', 'processing']
      : ['selfie', 'documentFront', 'documentBack', 'processing'];

  const nextStep = useCallback(
    (current: Step) => {
      const idx = steps.indexOf(current);
      if (idx === -1) return 'processing';
      return steps[idx + 1] ?? 'complete';
    },
    [steps],
  );

  const start = useCallback(async () => {
    setError(null);
    try {
      const client = getClient();
      await client.createVerificationToken(config.externalUserId, '3');
      const session = await client.startVerification({
        documentType: config.documentType,
        country: config.country,
        externalId: config.externalUserId,
      });
      setVerificationId(session.verificationId);
      setStep('selfie');
    } catch (e) {
      const msg = (e as Error).message || 'Failed to start';
      setError(msg);
      config.onError?.(e as Error);
    }
  }, [getClient, config]);

  const handleCaptured = useCallback(
    async (dataUrl: string) => {
      if (!verificationId) return;
      setError(null);
      try {
        const client = getClient();
        if (step === 'selfie') {
          await client.uploadSelfie({ verificationId, imageData: dataUrl });
        } else if (step === 'documentFront') {
          await client.uploadDocument({ verificationId, type: 'front', imageData: dataUrl });
        } else if (step === 'documentBack') {
          await client.uploadDocument({ verificationId, type: 'back', imageData: dataUrl });
        }
        const ns = nextStep(step);
        if (ns === 'processing') {
          setStep('processing');
          const final = await client.pollStatus(verificationId, 3000, 120000);
          const status = final.status as string;
          config.onStatusChanged?.({ type: 'statusChanged', status });
          setResult(status === 'APPROVED' ? 'approved' : 'rejected');
          setStep('complete');
          config.onComplete?.(
            status === 'APPROVED' ? 'approved' : 'rejected',
          );
        } else {
          setStep(ns);
        }
      } catch (e) {
        const msg = (e as Error).message || 'Upload failed';
        setError(msg);
        config.onError?.(e as Error);
      }
    },
    [verificationId, step, getClient, nextStep, config],
  );

  // Apply theme as CSS variables on the root container.
  const themeStyle: React.CSSProperties = {
    ['--kyc-primary' as any]: theme.primaryColor ?? '#4f46e5',
    ['--kyc-bg' as any]: theme.backgroundColor ?? '#ffffff',
    ['--kyc-text' as any]: theme.textColor ?? '#111827',
    background: 'var(--kyc-bg)',
    color: 'var(--kyc-text)',
  };

  return (
    <div style={{ ...themeStyle, padding: 16, borderRadius: 12, maxWidth: 420, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
          {error}
        </div>
      )}

      {step === 'idle' && (
        <button onClick={start} style={primaryButton()}>
          {t.start}
        </button>
      )}

      {(step === 'selfie' || step === 'documentFront' || step === 'documentBack') && (
        <CameraStep
          title={
            step === 'selfie'
              ? t.selfieTitle!
              : step === 'documentFront'
                ? t.documentFrontTitle!
                : t.documentBackTitle!
          }
          hint={step === 'selfie' ? t.selfieHint! : t.documentHint!}
          overlay={step === 'selfie' ? 'face' : 'document'}
          strings={t}
          onCapture={handleCaptured}
        />
      )}

      {step === 'processing' && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spinner />
          <p style={{ marginTop: 12 }}>{t.processing}</p>
        </div>
      )}

      {step === 'complete' && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div
            style={{
              fontSize: 48,
              color: result === 'approved' ? '#10b981' : '#ef4444',
            }}
          >
            {result === 'approved' ? '✓' : '✕'}
          </div>
          <p style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>
            {result === 'approved' ? t.approved : t.rejected}
          </p>
          {result === 'rejected' && (
            <button onClick={start} style={{ ...primaryButton(), marginTop: 16 }}>
              {t.retry}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function primaryButton(): React.CSSProperties {
  return {
    background: 'var(--kyc-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  };
}

function secondaryButton(): React.CSSProperties {
  return {
    background: 'transparent',
    color: 'var(--kyc-text)',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    cursor: 'pointer',
  };
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 28,
        height: 28,
        border: '3px solid #e5e7eb',
        borderTopColor: 'var(--kyc-primary)',
        borderRadius: '50%',
        animation: 'kycspin 0.8s linear infinite',
      }}
    />
  );
}

interface CameraStepProps {
  title: string;
  hint: string;
  overlay: 'face' | 'document';
  strings: PaytesyKYCWebStrings;
  onCapture: (dataUrl: string) => void | Promise<void>;
}

function CameraStep({ title, hint, overlay, strings, onCapture }: CameraStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(
    overlay === 'face' ? 'user' : 'environment',
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(
    async (mode: 'user' | 'environment') => {
      setCameraError(null);
      try {
        stopCamera();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        setCameraError(strings.cameraError ?? 'Camera unavailable');
      }
    },
    [stopCamera, strings.cameraError],
  );

  useEffect(() => {
    startCamera(facingMode);
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facingMode === 'user') {
      // Mirror the selfie so it matches what the user sees.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPreview(canvas.toDataURL('image/jpeg', 0.85));
    stopCamera();
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
    stopCamera();
  };

  const confirm = async () => {
    if (!preview) return;
    setUploading(true);
    try {
      await onCapture(preview);
    } finally {
      setUploading(false);
    }
  };

  const retake = () => {
    setPreview(null);
    startCamera(facingMode);
  };

  return (
    <div>
      <style>{`@keyframes kycspin { to { transform: rotate(360deg); } }`}</style>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>{title}</h3>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>{hint}</p>

      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 4',
          background: '#111827',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {preview ? (
          <img src={preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: facingMode === 'user' ? 'scaleX(-1)' : undefined,
              }}
            />
            <Overlay shape={overlay} />
          </>
        )}
      </div>

      {cameraError && (
        <p style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{cameraError}</p>
      )}

      {!preview ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {!cameraError && (
            <button onClick={capture} style={primaryButton()}>{strings.capture}</button>
          )}
          <button onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))} style={secondaryButton()}>
            {strings.switchCamera}
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={secondaryButton()}>
            {strings.uploadInstead}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture={overlay === 'face' ? 'user' : 'environment'}
            style={{ display: 'none' }}
            onChange={onFilePicked}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={retake} style={secondaryButton()} disabled={uploading}>
            {strings.retake}
          </button>
          <button onClick={confirm} style={primaryButton()} disabled={uploading}>
            {uploading ? '…' : strings.confirm}
          </button>
        </div>
      )}
    </div>
  );
}

function Overlay({ shape }: { shape: 'face' | 'document' }) {
  if (shape === 'face') {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: '60%',
            aspectRatio: '3 / 4',
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.8)',
            boxShadow: '0 0 0 2000px rgba(0,0,0,0.25)',
          }}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        inset: '12% 8%',
        border: '2px solid rgba(255,255,255,0.8)',
        borderRadius: 8,
        boxShadow: '0 0 0 2000px rgba(0,0,0,0.25)',
        pointerEvents: 'none',
      }}
    />
  );
}

export default PaytesyKYCWeb;

/**
 * Active-liveness capture (MediaPipe).
 *
 * Exported alongside the existing flow rather than wired into it: the flow is
 * mid-refactor, and a caller can adopt liveness on its own timetable. The
 * challenge itself comes from the server via `KYCClient.createLivenessChallenge`.
 */
export { LivenessCapture, type LivenessCaptureProps } from './liveness/liveness-capture';
export { useFacePose, type UseFacePoseOptions, type UseFacePoseResult, type FacePoseStatus } from './liveness/use-face-pose';
export { poseFromMatrix, type PoseOptions } from './liveness/pose';
