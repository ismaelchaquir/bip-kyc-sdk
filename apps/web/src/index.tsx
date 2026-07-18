import React, { useCallback, useState, useEffect } from 'react';
import { createKYCClient, KYCCredentials, KYCStatusEvent, VerificationStatus } from '@bipkyc/core';

export interface PaytesyKYCWebConfig {
  apiKey: string;
  baseUrl: string;
  documentType: 'IDENTITY_CARD' | 'DRIVING_LICENSE';
  country: string;
  externalUserId: string;
  onStatusChanged?: (event: KYCStatusEvent) => void;
  onComplete?: (status: 'approved' | 'rejected' | 'error', error?: string) => void;
  onError?: (error: Error) => void;
}

export interface PaytesyKYCWebResult {
  status: 'approved' | 'rejected' | 'error';
  verificationId?: string;
  error?: string;
}

export interface PaytesyKYCWebProps {
  config: PaytesyKYCWebConfig;
  customUI?: {
    buttonText?: string;
    buttonStyle?: React.CSSProperties;
    containerStyle?: React.CSSProperties;
    textStyle?: React.CSSProperties;
  };
}

type KYCStep =
  | 'idle'
  | 'starting'
  | 'selfie'
  | 'documentFront'
  | 'documentBack'
  | 'processing'
  | 'complete';

const DEFAULT_BUTTON_TEXT = 'Start Verification';

export function PaytesyKYCWeb({ config, customUI }: PaytesyKYCWebProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<KYCStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);

  const {
    apiKey,
    baseUrl,
    documentType,
    country,
    externalUserId,
    onStatusChanged,
    onComplete,
    onError,
  } = config;

  const getClient = useCallback(() => {
    return createKYCClient({ apiKey, baseUrl });
  }, [apiKey, baseUrl]);

  const handleError = useCallback(
    (err: Error) => {
      const errorMessage = err.message || 'An error occurred';
      setError(errorMessage);
      onError?.(err);
    },
    [onError]
  );

  const handleComplete = useCallback(
    (status: 'approved' | 'rejected' | 'error', errorMsg?: string) => {
      setIsLoading(false);
      setCurrentStep('complete');
      onComplete?.(status, errorMsg);
    },
    [onComplete]
  );

  const startVerification = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setCurrentStep('starting');

    try {
      const client = getClient();

      await client.createVerificationToken(externalUserId, '3');

      const result = await client.startVerification({
        documentType,
        country,
        externalId: externalUserId,
      });

      setVerificationId(result.verificationId);
      setCurrentStep('selfie');
      setIsLoading(false);

      onStatusChanged?.({
        type: 'statusChanged',
        status: 'PENDING',
      });
    } catch (err: any) {
      setIsLoading(false);
      setCurrentStep('idle');
      handleError(err);
    }
  }, [documentType, country, externalUserId, getClient, onStatusChanged, handleError]);

  const handleFileUpload = useCallback(
    async (type: 'selfie' | 'front' | 'back', file: File) => {
      if (!verificationId) return;

      setIsLoading(true);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        const base64 = btoa(String.fromCharCode(...buffer));

        const client = getClient();

        if (type === 'selfie') {
          await client.uploadSelfie({
            verificationId,
            imageData: base64,
          });
          setCurrentStep('documentFront');
        } else {
          await client.uploadDocument({
            verificationId,
            type: type as 'front' | 'back',
            imageData: base64,
          });

          if (type === 'front') {
            setCurrentStep('documentBack');
          } else {
            setCurrentStep('processing');
            pollForResult();
          }
        }

        onStatusChanged?.({
          type: 'statusChanged',
          status: 'PROCESSING',
        });

        setIsLoading(false);
      } catch (err: any) {
        setIsLoading(false);
        handleError(err);
      }
    },
    [verificationId, getClient, onStatusChanged, handleError]
  );

  const pollForResult = useCallback(async () => {
    if (!verificationId) return;

    try {
      const client = getClient();
      const status = await client.pollStatus(verificationId, 3000, 120000);

      if (status.status === 'APPROVED') {
        handleComplete('approved');
      } else if (status.status === 'REJECTED') {
        handleComplete('rejected');
      } else {
        handleComplete('error', 'Verification did not complete successfully');
      }
    } catch (err: any) {
      handleError(err);
    }
  }, [verificationId, getClient, handleComplete, handleError]);

  const handleFileChange =
    (type: 'selfie' | 'front' | 'back') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileUpload(type, file);
      }
    };

  const defaultButtonStyle: React.CSSProperties = {
    backgroundColor: '#4F46E5',
    color: '#fff',
    padding: '14px 24px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    minWidth: '200px',
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'selfie':
        return (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h3 style={{ marginBottom: '8px', color: '#1F2937' }}>Take a Selfie</h3>
            <p style={{ marginBottom: '20px', color: '#6B7280' }}>
              Please upload a clear photo of your face
            </p>
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileChange('selfie')}
              disabled={isLoading}
              style={{ marginBottom: '12px' }}
            />
          </div>
        );

      case 'documentFront':
        return (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h3 style={{ marginBottom: '8px', color: '#1F2937' }}>Document Front</h3>
            <p style={{ marginBottom: '20px', color: '#6B7280' }}>
              Upload the front of your{' '}
              {documentType === 'IDENTITY_CARD' ? 'ID Card' : 'Driving License'}
            </p>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange('front')}
              disabled={isLoading}
            />
          </div>
        );

      case 'documentBack':
        return (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h3 style={{ marginBottom: '8px', color: '#1F2937' }}>Document Back</h3>
            <p style={{ marginBottom: '20px', color: '#6B7280' }}>
              Upload the back of your{' '}
              {documentType === 'IDENTITY_CARD' ? 'ID Card' : 'Driving License'}
            </p>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange('back')}
              disabled={isLoading}
            />
          </div>
        );

      case 'processing':
        return (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ marginBottom: '16px' }}>⏳</div>
            <h3 style={{ marginBottom: '8px', color: '#1F2937' }}>Processing...</h3>
            <p style={{ color: '#6B7280' }}>
              We're verifying your documents. This may take a moment.
            </p>
          </div>
        );

      case 'complete':
        return (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ marginBottom: '16px' }}>✅</div>
            <h3 style={{ marginBottom: '8px', color: '#1F2937' }}>Complete!</h3>
            <p style={{ color: '#6B7280' }}>Your verification has been submitted.</p>
          </div>
        );

      default:
        return null;
    }
  };

  const renderContent = () => {
    if (currentStep !== 'idle') {
      return renderStepContent();
    }

    return (
      <button
        onClick={startVerification}
        disabled={isLoading}
        style={{
          ...defaultButtonStyle,
          ...customUI?.buttonStyle,
          opacity: isLoading ? 0.7 : 1,
          cursor: isLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {isLoading ? 'Starting...' : customUI?.buttonText || DEFAULT_BUTTON_TEXT}
      </button>
    );
  };

  return (
    <div style={customUI?.containerStyle || {}}>
      {error && (
        <div
          style={{
            backgroundColor: '#FEE2E2',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '12px',
            color: '#DC2626',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#DC2626',
              textDecoration: 'underline',
              cursor: 'pointer',
              marginLeft: '8px',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {renderContent()}
    </div>
  );
}

export default PaytesyKYCWeb;
