import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { createKYCClient, KYCStatusEvent } from '@kyciris/core';

export interface KycirisConfig {
  apiKey: string;
  baseUrl: string;
  documentType: 'IDENTITY_CARD' | 'DRIVING_LICENSE';
  country: string;
  externalUserId: string;
  onStatusChanged?: (event: KYCStatusEvent) => void;
  onComplete?: (status: 'approved' | 'rejected' | 'error', error?: string) => void;
  onError?: (error: Error) => void;
}

export interface KycirisResult {
  status: 'approved' | 'rejected' | 'error';
  verificationId?: string;
  error?: string;
}

interface KycirisProps {
  config: KycirisConfig;
  customUI?: {
    buttonText?: string;
    buttonStyle?: object;
    containerStyle?: object;
    textStyle?: object;
  };
}

const DEFAULT_BUTTON_TEXT = 'Verify Identity';

type KYCStep =
  | 'idle'
  | 'starting'
  | 'selfie'
  | 'documentFront'
  | 'documentBack'
  | 'processing'
  | 'complete';

export function Kyciris({ config, customUI }: KycirisProps): React.ReactElement {
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

  const captureImage = useCallback(
    async (useCamera: boolean): Promise<string | null> => {
      try {
        if (useCamera) {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            handleError(new Error('Camera permission is required to take photos'));
            return null;
          }
        }

        const result = useCamera
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.8,
              base64: true,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.8,
              base64: true,
            });

        if (result.canceled || !result.assets?.[0]) {
          return null;
        }

        const asset = result.assets[0];
        if (asset.uri) {
          return asset.uri;
        }

        if (asset.base64) {
          return asset.base64;
        }

        return null;
      } catch (err: any) {
        handleError(err);
        return null;
      }
    },
    [handleError]
  );

  const handleSelfieCapture = useCallback(async () => {
    if (!verificationId) return;

    setIsLoading(true);

    try {
      const imageData = await captureImage(true);
      if (!imageData) {
        setIsLoading(false);
        return;
      }

      const client = getClient();
      await client.uploadSelfie({
        verificationId,
        imageData,
      });

      setCurrentStep('documentFront');
      setIsLoading(false);

      onStatusChanged?.({
        type: 'statusChanged',
        status: 'PROCESSING',
      });
    } catch (err: any) {
      setIsLoading(false);
      handleError(err);
    }
  }, [verificationId, captureImage, getClient, onStatusChanged, handleError]);

  const handleDocumentCapture = useCallback(
    async (type: 'front' | 'back') => {
      if (!verificationId) return;

      setIsLoading(true);

      try {
        const imageData = await captureImage(true);
        if (!imageData) {
          setIsLoading(false);
          return;
        }

        const client = getClient();
        await client.uploadDocument({
          verificationId,
          type,
          imageData,
        });

        if (type === 'front') {
          setCurrentStep('documentBack');
          setIsLoading(false);
        } else {
          setCurrentStep('processing');
          await pollForResult();
        }

        onStatusChanged?.({
          type: 'statusChanged',
          status: 'PROCESSING',
        });
      } catch (err: any) {
        setIsLoading(false);
        handleError(err);
      }
    },
    [verificationId, captureImage, getClient, onStatusChanged, handleError]
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

  const renderStepContent = () => {
    switch (currentStep) {
      case 'selfie':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Take a Selfie</Text>
            <Text style={styles.stepDescription}>Please take a clear photo of your face</Text>
            <TouchableOpacity
              style={[styles.captureButton, customUI?.buttonStyle]}
              onPress={handleSelfieCapture}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.buttonText, customUI?.textStyle]}>Take Photo</Text>
              )}
            </TouchableOpacity>
          </View>
        );

      case 'documentFront':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Document Front</Text>
            <Text style={styles.stepDescription}>
              Take a photo of the front of your{' '}
              {documentType === 'IDENTITY_CARD' ? 'ID Card' : 'Driving License'}
            </Text>
            <TouchableOpacity
              style={[styles.captureButton, customUI?.buttonStyle]}
              onPress={() => handleDocumentCapture('front')}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.buttonText, customUI?.textStyle]}>Take Photo</Text>
              )}
            </TouchableOpacity>
          </View>
        );

      case 'documentBack':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Document Back</Text>
            <Text style={styles.stepDescription}>
              Take a photo of the back of your{' '}
              {documentType === 'IDENTITY_CARD' ? 'ID Card' : 'Driving License'}
            </Text>
            <TouchableOpacity
              style={[styles.captureButton, customUI?.buttonStyle]}
              onPress={() => handleDocumentCapture('back')}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.buttonText, customUI?.textStyle]}>Take Photo</Text>
              )}
            </TouchableOpacity>
          </View>
        );

      case 'processing':
        return (
          <View style={styles.stepContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.stepTitle}>Processing...</Text>
            <Text style={styles.stepDescription}>
              We're verifying your documents. This may take a moment.
            </Text>
          </View>
        );

      case 'complete':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Complete!</Text>
            <Text style={styles.stepDescription}>Your verification has been submitted.</Text>
          </View>
        );

      default:
        return null;
    }
  };

  const renderButton = () => {
    if (currentStep !== 'idle') {
      return renderStepContent();
    }

    return (
      <TouchableOpacity
        style={[styles.button, customUI?.buttonStyle]}
        onPress={startVerification}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.buttonText, customUI?.textStyle]}>
            {customUI?.buttonText || DEFAULT_BUTTON_TEXT}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, customUI?.containerStyle]}>
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorDismiss}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {renderButton()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  stepContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  captureButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    width: '100%',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  errorDismiss: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
});

export default Kyciris;
