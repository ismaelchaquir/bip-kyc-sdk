import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LivenessStep } from '@bipdelivery/react-native';
import { DocumentUpload } from '../components/document-upload';
import { VerificationResult } from '../components/verification-result';
import { startSession, type Session } from '../lib/session';

/**
 * Example 1 — `LivenessStep`: the SDK runs the selfie step.
 *
 * The least code of the three. The component draws the challenge, runs the
 * capture, uploads the selfie with its frames, and shows its own error with a
 * retry that draws a FRESH challenge — a spent one is rejected, so a retry that
 * reuses it looks to the applicant like the product is broken.
 *
 * Choose this when the app has no opinion about the selfie step. If it already
 * owns that state — a store, a phase machine of its own — see capture-example.
 */
type Phase = 'starting' | 'documents' | 'selfie' | 'result' | 'error';

export default function StepExample() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('starting');
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setPhase('starting');
    setError(null);
    try {
      setSession(await startSession());
      setPhase('documents');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.fill}>
        <View style={styles.centred}>
          <Text style={styles.heading}>Could not start</Text>
          <Text style={styles.body}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={() => void start()}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'starting' || !session) {
    return (
      <SafeAreaView style={styles.fill}>
        <View style={styles.centred}>
          <ActivityIndicator color="#4F46E5" />
          <Text style={styles.body}>Starting a verification…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'documents') {
    return (
      <SafeAreaView style={styles.fill}>
        <DocumentUpload
          client={session.client}
          verificationId={session.verificationId}
          onUploaded={() => setPhase(session.livenessRequired ? 'selfie' : 'result')}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'selfie') {
    // Full-bleed: the camera fills the screen, so no SafeAreaView around it.
    return (
      <LivenessStep
        client={session.client}
        verificationId={session.verificationId}
        onUploaded={() => setPhase('result')}
        onCancel={() => router.back()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.fill}>
      <VerificationResult
        client={session.client}
        verificationId={session.verificationId}
        onRestart={() => void start()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#F9FAFB' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827' },
  body: { fontSize: 15, color: '#374151', textAlign: 'center' },
  button: {
    marginTop: 12,
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
