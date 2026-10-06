import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { KYCCore, VerificationStatus } from '@bipdelivery/core';

export interface WaitingApprovalProps {
  client: KYCCore;
  verificationId: string;
  /** How long the bar takes to fill. Not a promise — the decision may be sooner or later. */
  durationMs?: number;
  onDecided: (status: VerificationStatus) => void;
  onTimeout: () => void;
}

/**
 * "We are checking your documents" — the screen the applicant sits on while the
 * workers do their part, modelled on the izzo flow's waiting step.
 *
 * The bar is honest about being an estimate rather than progress: there is no
 * progress to report, because OCR, face match and liveness run in parallel on
 * queues. Showing a filling bar is kinder than a bare spinner, and pretending it
 * measures anything is not.
 *
 * An app that can receive push notifications should not keep this screen open at
 * all: kyc-mz posts a webhook to your backend on every decision, and a phone
 * that sleeps stops polling.
 */
export function WaitingApproval({
  client,
  verificationId,
  durationMs = 90000,
  onDecided,
  onTimeout,
}: WaitingApprovalProps) {
  const [elapsed, setElapsed] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    const ticker = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => clearInterval(ticker);
  }, [durationMs, progress]);

  useEffect(() => {
    let cancelled = false;
    client
      .pollStatus(verificationId, 3000, durationMs + 60000)
      .then((status) => {
        if (!cancelled) onDecided(status);
      })
      .catch(() => {
        // Nothing came back in time. The verification is not lost — the reaper
        // sends it to review — so the app should stop waiting, not fail.
        if (!cancelled) onTimeout();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, verificationId]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['4%', '100%'] });

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4F46E5" />
      <Text style={styles.title}>Checking your document</Text>
      <Text style={styles.body}>
        Reading the card, matching your face to its photo, and checking the capture was live. This
        usually takes under a minute.
      </Text>

      <View style={styles.track}>
        <Animated.View style={[styles.bar, { width }]} />
      </View>
      <Text style={styles.meta}>{elapsed}s</Text>

      <TouchableOpacity onPress={onTimeout} style={styles.later}>
        <Text style={styles.laterText}>Continue in the background</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginTop: 8 },
  body: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  track: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    marginTop: 12,
  },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#4F46E5' },
  meta: { fontSize: 12, color: '#9CA3AF' },
  later: { marginTop: 20 },
  laterText: { color: '#4F46E5', fontWeight: '600' },
});
