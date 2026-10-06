import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { KYC_CREDENTIALS } from '../constants/kyc';

/**
 * Three ways to run the same verification, from least code to most control.
 * They differ only in who owns the selfie step; the server-side flow is
 * identical, and so is the decision.
 */
const EXAMPLES = [
  {
    route: '/step-example',
    packages: '@bipdelivery/core + @bipdelivery/react-native',
    title: 'LivenessStep',
    body:
      'The SDK runs the whole selfie step: draws the challenge, captures, uploads, and handles its own retry. Two callbacks of your code.',
    when: 'Start here unless your app already models the flow.',
  },
  {
    route: '/capture-example',
    packages: '@bipdelivery/core + @bipdelivery/react-native',
    title: 'LivenessCapture',
    body:
      'Same camera and coaching, but your app draws the challenge, uploads the frames and decides what a failure offers next.',
    when: 'When the verification already lives in your own store or state machine.',
  },
  {
    route: '/core-example',
    packages: '@bipdelivery/core only',
    title: 'Core, with your own UI',
    body:
      'No SDK components. Your cameras, your prompts, your waiting and rejection screens — driving the challenge machine from core so the client and the server still agree.',
    when: 'When the design is yours end to end. The flow here follows the izzo app.',
  },
];

export default function Examples() {
  const router = useRouter();
  const configured = !!KYC_CREDENTIALS.apiKey;

  return (
    <SafeAreaView style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>BipDelivery KYC</Text>
        <Text style={styles.subtitle}>
          One verification, three integrations. Each starts its own verification against{' '}
          {KYC_CREDENTIALS.baseUrl}.
        </Text>

        {!configured ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>No API key</Text>
            <Text style={styles.noticeBody}>
              Copy .env.example to .env.local and set EXPO_PUBLIC_KYC_API_KEY to a project key from
              the dashboard. The examples mint a verification token with it, the way your backend
              would.
            </Text>
          </View>
        ) : null}

        {EXAMPLES.map((example) => (
          <TouchableOpacity
            key={example.route}
            style={styles.card}
            onPress={() => router.push(example.route as never)}
          >
            <Text style={styles.packages}>{example.packages}</Text>
            <Text style={styles.cardTitle}>{example.title}</Text>
            <Text style={styles.cardBody}>{example.body}</Text>
            <Text style={styles.cardWhen}>{example.when}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Browsers</Text>
          <Text style={styles.footerBody}>
            The web equivalents live in packages/web: `pnpm playground` serves the core-driven page,
            and /managed.html the same flow run end to end by KYCWeb.
          </Text>
          <Text style={styles.footerBody}>
            The camera needs a development build — `expo run:android` or `expo run:ios`. VisionCamera
            is native code, so Expo Go cannot load it.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 20, gap: 14 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 6, lineHeight: 20 },
  notice: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  noticeTitle: { fontWeight: '700', color: '#92400E' },
  noticeBody: { color: '#92400E', fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  packages: { fontSize: 11, color: '#4F46E5', fontWeight: '700', letterSpacing: 0.3 },
  cardTitle: { fontSize: 19, fontWeight: '700', color: '#111827' },
  cardBody: { fontSize: 14, color: '#4B5563', lineHeight: 20 },
  cardWhen: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic', marginTop: 2 },
  footer: { marginTop: 10, gap: 8 },
  footerTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  footerBody: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
});
