import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>KYC SDK Test App</Text>
        <Text style={styles.subtitle}>Test the Paytesy KYC SDK components</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Test Screens</Text>

          <TouchableOpacity 
            style={styles.card}
            onPress={() => router.push('/mobile-flow')}
          >
            <Text style={styles.cardTitle}>Mobile SDK Flow</Text>
            <Text style={styles.cardDescription}>
              Full automated flow with the mobile SDK component
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.card}
            onPress={() => router.push('/token-step')}
          >
            <Text style={styles.cardTitle}>Step-by-Step Flow</Text>
            <Text style={styles.cardDescription}>
              Manual step-by-step verification using core SDK
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Run Tests</Text>
          <Text style={styles.infoText}>
            Run tests with: npm test
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
});
