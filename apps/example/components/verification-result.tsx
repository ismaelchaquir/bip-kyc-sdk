import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { KYCCore, VerificationStatus } from '@bipdelivery/core';

export interface VerificationResultProps {
  client: KYCCore;
  verificationId: string;
  onRestart: () => void;
}

/**
 * Waits for the decision and shows it.
 *
 * Polling is what an example can do; an app should prefer a webhook to its own
 * backend and a push, because the workers take as long as they take and a phone
 * that goes to sleep stops polling.
 *
 * REVIEW is a decision, not a delay: the checks did not settle it and a human
 * will look. Treating it as "still working" is how a screen spins forever.
 */
export function VerificationResult({ client, verificationId, onRestart }: VerificationResultProps) {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .pollStatus(verificationId, 3000, 180000)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [client, verificationId]);

  if (error) {
    return (
      <View style={styles.centred}>
        <Text style={styles.heading}>Still processing</Text>
        <Text style={styles.body}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={onRestart}>
          <Text style={styles.buttonText}>Start over</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!status) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator color="#4F46E5" />
        <Text style={styles.body}>Reading the document and matching the face…</Text>
      </View>
    );
  }

  const label =
    status.status === 'APPROVED' ? 'Approved' : status.status === 'REJECTED' ? 'Rejected' : 'In review';

  return (
    <View style={styles.centred}>
      <Text style={styles.heading}>{label}</Text>
      {status.ocrData?.fullName ? (
        <Text style={styles.body}>Name read from the card: {status.ocrData.fullName}</Text>
      ) : null}
      {typeof status.faceMatchScore === 'number' ? (
        <Text style={styles.body}>Face similarity: {status.faceMatchScore.toFixed(3)}</Text>
      ) : null}
      <Text style={styles.meta}>{verificationId}</Text>
      <TouchableOpacity style={styles.button} onPress={onRestart}>
        <Text style={styles.buttonText}>Run it again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  body: { fontSize: 15, color: '#374151', textAlign: 'center' },
  meta: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  button: {
    marginTop: 20,
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
