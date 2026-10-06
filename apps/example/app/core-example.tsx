import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import type {
  ClientChallengeReport,
  LivenessChallenge,
  VerificationStatus,
} from '@bipdelivery/core';
import { DocumentCamera } from '../components/core/document-camera';
import { LivenessCamera } from '../components/core/liveness-camera';
import { WaitingApproval } from '../components/core/waiting-approval';
import { startSession, type Session } from '../lib/session';

/**
 * Example 3 — `@bipdelivery/core` only, with the app's own UI.
 *
 * No SDK components: the cameras, the prompts, the waiting screen and the
 * rejection screen all belong to the app. What still comes from the SDK is the
 * part that must not be reimplemented — the API client and the challenge state
 * machine, thresholds and sign conventions included, because the server judges
 * the result against the same rules.
 *
 * The flow follows the one in the izzo app, which is where this shape comes
 * from: capture → look at it → retake or submit → liveness → waiting for
 * approval → approved or rejected.
 */
type Phase =
  | 'initializing'
  | 'front'
  | 'back'
  | 'challenge'
  | 'liveness'
  | 'submitting'
  | 'decided'
  | 'backgrounded'
  | 'error';

export default function CoreExample() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('initializing');
  const [session, setSession] = useState<Session | null>(null);
  const [challenge, setChallenge] = useState<LivenessChallenge | null>(null);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setPhase('initializing');
    setError(null);
    setStatus(null);
    setChallenge(null);
    try {
      setSession(await startSession());
      setPhase('front');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  const fail = (cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
    setPhase('error');
  };

  const drawChallenge = useCallback(async (current: Session) => {
    setPhase('challenge');
    try {
      setChallenge(await current.client.createLivenessChallenge(current.verificationId));
      setPhase('liveness');
    } catch (cause) {
      fail(cause);
    }
  }, []);

  const uploadSide = async (side: 'front' | 'back', uri: string) => {
    if (!session) return;
    setBusy(true);
    try {
      await session.client.uploadDocument({
        verificationId: session.verificationId,
        type: side,
        imageData: uri,
      });
      if (side === 'front') setPhase('back');
      else if (session.livenessRequired) await drawChallenge(session);
      else setPhase('submitting');
    } catch (cause) {
      fail(cause);
    }
    setBusy(false);
  };

  const uploadSelfie = async (
    selfieUri: string,
    frameUris: string[],
    report: ClientChallengeReport,
  ) => {
    if (!session) return;
    setBusy(true);
    try {
      await session.client.uploadSelfie({
        verificationId: session.verificationId,
        imageData: selfieUri,
        liveness: { frames: frameUris, report },
      });
      setPhase('submitting');
    } catch (cause) {
      // The challenge is spent either way; a retry has to draw a new one.
      setChallenge(null);
      fail(cause);
    }
    setBusy(false);
  };

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.fill}>
        <View style={styles.centred}>
          <Text style={styles.heading}>Something went wrong</Text>
          <Text style={styles.body}>{error}</Text>
          <TouchableOpacity
            style={styles.primary}
            onPress={() =>
              session && session.livenessRequired && phase === 'error' && challenge === null
                ? void drawChallenge(session)
                : void start()
            }
          >
            <Text style={styles.primaryText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.link}>Back to the examples</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!session || phase === 'initializing' || phase === 'challenge') {
    return (
      <SafeAreaView style={styles.fill}>
        <View style={styles.centred}>
          <ActivityIndicator color="#4F46E5" />
          <Text style={styles.body}>
            {phase === 'challenge' ? 'Preparing the movements…' : 'Starting the verification…'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'front' || phase === 'back') {
    const front = phase === 'front';
    return (
      <DocumentCamera
        key={phase}
        title={front ? 'Front of your ID' : 'Back of your ID'}
        hint={
          front
            ? 'Fill the frame with the card. Avoid glare on the photo.'
            : 'The lines at the bottom must be sharp — the dates are read from them.'
        }
        busy={busy}
        onSubmit={(uri) => void uploadSide(front ? 'front' : 'back', uri)}
        onCancel={() => router.back()}
      />
    );
  }

  if (phase === 'liveness' && challenge) {
    return (
      <LivenessCamera
        key={challenge.id}
        actions={challenge.actions}
        challengeId={challenge.id}
        uploading={busy}
        onComplete={(selfie, frames, report) => void uploadSelfie(selfie, frames, report)}
        onRetry={() => void drawChallenge(session)}
        onCancel={() => router.back()}
      />
    );
  }

  if (phase === 'submitting') {
    return (
      <SafeAreaView style={styles.fill}>
        <WaitingApproval
          client={session.client}
          verificationId={session.verificationId}
          onDecided={(decided) => {
            setStatus(decided);
            setPhase('decided');
          }}
          onTimeout={() => setPhase('backgrounded')}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'backgrounded') {
    return (
      <SafeAreaView style={styles.fill}>
        <View style={styles.centred}>
          <Text style={styles.heading}>We will let you know</Text>
          <Text style={styles.body}>
            The checks are still running. In a real app this is where your backend takes over: it
            receives the webhook and notifies the user.
          </Text>
          <TouchableOpacity style={styles.primary} onPress={() => router.back()}>
            <Text style={styles.primaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Decided. Rejection gets its own words: an applicant told only "rejected"
  // writes to support, which is the expensive outcome.
  const approved = status?.status === 'APPROVED';
  const review = status?.status === 'REVIEW';

  return (
    <SafeAreaView style={styles.fill}>
      <View style={styles.centred}>
        <View style={[styles.badge, approved ? styles.badgeOk : review ? styles.badgeWait : styles.badgeBad]}>
          <Text style={styles.badgeText}>{approved ? '✓' : review ? '…' : '!'}</Text>
        </View>
        <Text style={styles.heading}>
          {approved ? 'You are verified' : review ? 'Being reviewed' : 'We could not verify you'}
        </Text>
        <Text style={styles.body}>
          {approved
            ? status?.ocrData?.fullName
              ? `Welcome, ${status.ocrData.fullName}.`
              : 'Your document and your face matched.'
            : review
              ? 'Someone will look at your documents. You will hear from us shortly.'
              : 'The document or the selfie could not be accepted. You can try again with better light, or talk to us.'}
        </Text>

        {!approved && !review ? (
          <TouchableOpacity style={styles.primary} onPress={() => void start()}>
            <Text style={styles.primaryText}>Try again</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Back to the examples</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#F9FAFB' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  heading: { fontSize: 23, fontWeight: '700', color: '#111827', textAlign: 'center' },
  body: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  primary: {
    marginTop: 14,
    backgroundColor: '#4F46E5',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
  },
  primaryText: { color: '#fff', fontWeight: '700' },
  link: { color: '#4F46E5', fontWeight: '600', marginTop: 10 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  badgeOk: { backgroundColor: '#10B981' },
  badgeBad: { backgroundColor: '#EF4444' },
  badgeWait: { backgroundColor: '#F59E0B' },
  badgeText: { color: '#fff', fontSize: 30, fontWeight: '700' },
});
