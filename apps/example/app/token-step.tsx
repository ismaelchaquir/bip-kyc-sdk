import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { createKYCClient, requiresLivenessChallenge } from '@bipdelivery/core';
import { useVerificationStore } from '../store/verificationStore';
import { KYC_CREDENTIALS } from '../constants/kyc';

export default function TokenStep() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { setVerificationId, setToken, setStep, setLivenessRequired } = useVerificationStore();

  const handleCreateToken = async () => {
    setLoading(true);
    try {
      const client = createKYCClient(KYC_CREDENTIALS);
      const externalId = `test-${Date.now()}`;
      const result = await client.createVerificationToken(externalId, '3');
      setToken(result.token);

      const verifResult = await client.startVerification({
        documentType: 'IDENTITY_CARD',
        country: 'MZ',
        externalId,
      });
      setVerificationId(verifResult.verificationId);
      // The server decides the selfie step: a liveness flow rejects a plain
      // selfie, so this has to follow the project's flow, not a toggle here.
      setLivenessRequired(requiresLivenessChallenge(verifResult));
      setStep('front');
      router.push('/front-document');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Step 1: Create Token</Text>
        <Text style={styles.description}>Create a verification token to start the KYC process</Text>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCreateToken}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Creating...' : 'Create Token & Start Verification'}
          </Text>
        </TouchableOpacity>
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
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
