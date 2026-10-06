import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ClientChallengeReport, KYCCore, LivenessChallenge, UploadResult } from '@bipdelivery/core';
import { LivenessCapture } from './liveness-capture';
import type { LivenessCaptureProps } from './liveness-capture';
import { defaultTheme } from './theme';

export interface LivenessStepProps
  extends Pick<LivenessCaptureProps, 'theme' | 'labels' | 'debug' | 'onCancel'> {
  client: KYCCore;
  verificationId: string;
  /** The selfie and its challenge evidence were accepted by kyc-mz. */
  onUploaded: (result: UploadResult) => void;
  /** Drawing a challenge or uploading failed. Defaults to showing it with a retry. */
  onError?: (error: Error) => void;
}

/**
 * The whole selfie step for a flow that requires the challenge: draws a
 * challenge from kyc-mz, runs the capture, and uploads the selfie with its
 * frames. For apps that do not already manage this state themselves (the
 * driver app does, in its store, and uses LivenessCapture directly).
 *
 * Every attempt gets a fresh challenge. They are single-use: the upload burns
 * the one it was captured against, so retrying an upload — or a capture —
 * against the old challenge is rejected by the server for our own bookkeeping.
 */
export function LivenessStep({
  client,
  verificationId,
  onUploaded,
  onCancel,
  onError,
  theme,
  labels,
  debug,
}: LivenessStepProps) {
  const [challenge, setChallenge] = useState<LivenessChallenge | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const colours = { ...defaultTheme, ...theme };

  const fail = useCallback(
    (cause: unknown) => {
      const err = cause instanceof Error ? cause : new Error(String(cause));
      setError(err);
      onError?.(err);
    },
    [onError],
  );

  const drawChallenge = useCallback(async () => {
    setError(null);
    setChallenge(null);
    try {
      setChallenge(await client.createLivenessChallenge(verificationId));
    } catch (cause) {
      fail(cause);
    }
  }, [client, verificationId, fail]);

  useEffect(() => {
    void drawChallenge();
  }, [drawChallenge]);

  const upload = useCallback(
    async (selfieUri: string, frameUris: string[], report: ClientChallengeReport) => {
      setUploading(true);
      try {
        const result = await client.uploadSelfie({
          verificationId,
          imageData: selfieUri,
          liveness: { frames: frameUris, report },
        });
        onUploaded(result);
      } catch (cause) {
        // The upload consumed the challenge server-side whether or not it
        // succeeded, so the next attempt needs a new one.
        setChallenge(null);
        fail(cause);
      } finally {
        setUploading(false);
      }
    },
    [client, verificationId, onUploaded, fail],
  );

  if (error) {
    return (
      <View style={[styles.fill, { backgroundColor: colours.background }]}>
        <Text style={[styles.errorText, { color: colours.text }]}>{error.message}</Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colours.buttonBackground }]}
          onPress={() => void drawChallenge()}
        >
          <Text style={{ color: colours.buttonText, fontWeight: '600' }}>
            {labels?.tryAgain ?? 'Try again'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={onCancel}>
          <Text style={{ color: colours.text }}>{labels?.cancel ?? 'Cancel'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!challenge) {
    return (
      <View style={[styles.fill, { backgroundColor: colours.background }]}>
        <ActivityIndicator color={colours.text} />
      </View>
    );
  }

  return (
    <LivenessCapture
      // A new challenge is a new attempt: remounting clears the collected
      // frames and the machine along with it.
      key={challenge.id}
      actions={challenge.actions}
      challengeId={challenge.id}
      isUploading={uploading}
      onComplete={upload}
      onRetry={() => void drawChallenge()}
      onCancel={onCancel}
      theme={theme}
      labels={labels}
      debug={debug}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 16, textAlign: 'center', marginBottom: 24 },
  button: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  cancel: { marginTop: 24 },
});
