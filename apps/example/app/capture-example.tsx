import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LivenessCapture } from '@bipdelivery/react-native';
import type { ClientChallengeReport, LivenessChallenge } from '@bipdelivery/core';
import { DocumentUpload } from '../components/document-upload';
import { VerificationResult } from '../components/verification-result';
import { startSession, type Session } from '../lib/session';

/**
 * Example 2 — `LivenessCapture`: the SDK runs the camera, the app runs the step.
 *
 * Same camera and coaching as example 1; what moves into the app is the
 * orchestration — drawing the challenge, the spinner while it is drawn,
 * uploading the frames, and what a failure offers next. Choose this when the app
 * already models the flow (the driver app does, in a store) and a component that
 * fetched and uploaded on its own would fight it.
 *
 * Two rules the component cannot enforce from the outside:
 *
 *  - a challenge is single-use and the upload burns it, so every attempt needs a
 *    freshly drawn one;
 *  - give the challenge id as `key`, so a new attempt remounts and starts from
 *    an empty frame list rather than appending to the last one's.
 */
type Phase = 'starting' | 'documents' | 'challenge' | 'capture' | 'result' | 'error';

export default function CaptureExample() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('starting');
  const [session, setSession] = useState<Session | null>(null);
  const [challenge, setChallenge] = useState<LivenessChallenge | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setPhase('starting');
    setError(null);
    setChallenge(null);
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

  /** Every attempt — first or retry — comes through here. */
  const drawChallenge = useCallback(
    async (current: Session) => {
      setPhase('challenge');
      setError(null);
      setChallenge(null);
      try {
        setChallenge(await current.client.createLivenessChallenge(current.verificationId));
        setPhase('capture');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase('error');
      }
    },
    [],
  );

  const upload = useCallback(
    async (selfieUri: string, frameUris: string[], report: ClientChallengeReport) => {
      if (!session) return;
      setUploading(true);
      try {
        await session.client.uploadSelfie({
          verificationId: session.verificationId,
          imageData: selfieUri,
          liveness: { frames: frameUris, report },
        });
        setPhase('result');
      } catch (cause) {
        // The server consumed the challenge either way, so the next attempt
        // needs a new one rather than a re-upload of these frames.
        setChallenge(null);
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase('error');
      } finally {
        setUploading(false);
      }
    },
    [session],
  );

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.fill}>
        <View style={styles.centred}>
          <Text style={styles.heading}>That attempt failed</Text>
          <Text style={styles.body}>{error}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => (session ? void drawChallenge(session) : void start())}
          >
            <Text style={styles.buttonText}>{session ? 'New challenge' : 'Try again'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!session || phase === 'starting' || phase === 'challenge') {
    return (
      <SafeAreaView style={styles.fill}>
        <View style={styles.centred}>
          <ActivityIndicator color="#4F46E5" />
          <Text style={styles.body}>
            {phase === 'challenge' ? 'Drawing a challenge…' : 'Starting a verification…'}
          </Text>
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
          onUploaded={() =>
            session.livenessRequired ? void drawChallenge(session) : setPhase('result')
          }
        />
      </SafeAreaView>
    );
  }

  if (phase === 'capture' && challenge) {
    return (
      <LivenessCapture
        key={challenge.id}
        actions={challenge.actions}
        challengeId={challenge.id}
        isUploading={uploading}
        onComplete={upload}
        onRetry={() => void drawChallenge(session)}
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
