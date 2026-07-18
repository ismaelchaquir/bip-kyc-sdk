import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { Kyciris, KycirisConfig } from '@kyciris/mobile';

const TEST_CONFIG: KycirisConfig = {
  // apiKey: process.env.EXPO_PUBLIC_KYC_API_KEY || 'sk_94d68c4f-bca9-4a56-8cfb-8288a44e6b4d',
  // baseUrl: process.env.EXPO_PUBLIC_KYC_BASE_URL || 'https://wise-eft-healthy.ngrok-free.app',
  apiKey: process.env.EXPO_PUBLIC_KYC_API_KEY || 'sk_daec2a91-dfa0-46fd-9957-d7cbfdf878a1',
  baseUrl: process.env.EXPO_PUBLIC_KYC_BASE_URL || 'https://developers.kyciris.com',
  documentType: 'IDENTITY_CARD',
  country: 'US',
  externalUserId: `test-user-${Date.now()}`,
  onStatusChanged: (event: any) => {
    console.log('Status changed:', event);
  },
  onComplete: (status: any, error?: string) => {
    Alert.alert('Verification Complete', `Status: ${status}${error ? `\nError: ${error}` : ''}`);
  },
  onError: (error: any) => {
    Alert.alert('Error', error.message);
  },
};

export default function MobileFlowScreen() {
  const [userId] = useState(`test-user-${Date.now()}`);

  const config: KycirisConfig = {
    ...TEST_CONFIG,
    externalUserId: userId,
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Mobile SDK Flow</Text>
        <Text style={styles.description}>
          Test the mobile SDK component - handles the entire verification flow automatically
        </Text>

        <View style={styles.kycContainer}>
          <Kyciris
            config={config}
            customUI={{
              buttonText: 'Start Verification',
              buttonStyle: styles.customButton,
              textStyle: styles.customButtonText,
              containerStyle: styles.customContainer,
            }}
          />
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Configuration</Text>
          <Text style={styles.infoText}>API Key: {config.apiKey}</Text>
          <Text style={styles.infoText}>Base URL: {config.baseUrl}</Text>
          <Text style={styles.infoText}>Document Type: {config.documentType}</Text>
          <Text style={styles.infoText}>Country: {config.country}</Text>
          <Text style={styles.infoText}>User ID: {userId}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  kycContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  customButton: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  customButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  customContainer: {
    paddingVertical: 10,
  },
  infoSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
});
