import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createKYCClient, VerificationStatus } from '@bipdelivery/core';
import { useVerificationStore } from '../store/verificationStore';
import { KYC_CREDENTIALS } from '../constants/kyc';

export default function VerificationComplete() {
  const router = useRouter();
  const [loading, setLoading] = useState('');
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const { verificationId, frontDocument, backDocument, selfieImage, reset } =
    useVerificationStore();

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  };

  const handleGetStatus = async () => {
    if (!verificationId) return;
    setLoading('getStatus');
    addLog('Getting status...');
    try {
      const client = createKYCClient(KYC_CREDENTIALS);
      const result = await client.getStatus(verificationId);
      setStatus(result);
      addLog(`Status: ${result.status}`);
    } catch (err: any) {
      addLog(`Error: ${err.message}`);
    }
    setLoading('');
  };

  const handlePollStatus = async () => {
    if (!verificationId) return;
    setLoading('pollStatus');
    addLog('Starting status poll...');
    try {
      const client = createKYCClient(KYC_CREDENTIALS);
      const result = await client.pollStatus(verificationId, 2000, 30000);
      setStatus(result);
      addLog(`Poll complete: ${result.status}`);
    } catch (err: any) {
      addLog(`Poll error: ${err.message}`);
    }
    setLoading('');
  };

  const handleRestart = () => {
    reset();
    router.replace('/token-step');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Verification</Text>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Documents</Text>
          <Text style={styles.summaryItem}>Front: {frontDocument ? '✓' : '✗'}</Text>
          <Text style={styles.summaryItem}>Back: {backDocument ? '✓' : '✗'}</Text>
          <Text style={styles.summaryItem}>Selfie: {selfieImage ? '✓' : '✗'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification ID</Text>
          <TextInput
            style={styles.input}
            value={verificationId || ''}
            placeholder="Enter verification ID"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>

          <TouchableOpacity
            style={[styles.button, loading === 'getStatus' && styles.buttonDisabled]}
            onPress={handleGetStatus}
            disabled={!!loading || !verificationId}
          >
            <Text style={styles.buttonText}>Get Status</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading === 'pollStatus' && styles.buttonDisabled]}
            onPress={handlePollStatus}
            disabled={!!loading || !verificationId}
          >
            <Text style={styles.buttonText}>Poll Status</Text>
          </TouchableOpacity>
        </View>

        {status && (
          <View style={styles.statusBox}>
            <Text style={styles.statusTitle}>Current Status</Text>
            <Text style={styles.statusText}>Status: {status.status}</Text>
            {status.faceMatchScore !== undefined && (
              <Text style={styles.statusText}>Face Match: {status.faceMatchScore}</Text>
            )}
            {status.ocrData && (
              <>
                <Text style={styles.statusText}>OCR Data:</Text>
                {status.ocrData.fullName && (
                  <Text style={styles.ocrText}> Name: {status.ocrData.fullName}</Text>
                )}
                {status.ocrData.idNumber && (
                  <Text style={styles.ocrText}> ID: {status.ocrData.idNumber}</Text>
                )}
              </>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Logs</Text>
          {logs.length === 0 ? (
            <Text style={styles.emptyText}>No logs yet</Text>
          ) : (
            logs.map((log, index) => (
              <Text key={index} style={styles.logText}>
                {log}
              </Text>
            ))
          )}
        </View>

        <TouchableOpacity style={styles.restartButton} onPress={handleRestart}>
          <Text style={styles.restartText}>Start New Verification</Text>
        </TouchableOpacity>
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
    marginBottom: 16,
    textAlign: 'center',
  },
  summary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  summaryItem: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  button: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  ocrText: {
    fontSize: 12,
    color: '#6B7280',
  },
  logText: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  restartButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  restartText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '600',
  },
});
