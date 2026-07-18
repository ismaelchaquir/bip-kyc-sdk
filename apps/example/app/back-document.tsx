import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { createKYCClient, KYCCredentials } from '@kyciris/core';
import { useVerificationStore } from '../store/verificationStore';

const TEST_CREDENTIALS: KYCCredentials = {
  // apiKey: process.env.EXPO_PUBLIC_KYC_API_KEY || 'sk_94d68c4f-bca9-4a56-8cfb-8288a44e6b4d',
  // baseUrl: process.env.EXPO_PUBLIC_KYC_BASE_URL || 'https://wise-eft-healthy.ngrok-free.app',

  apiKey: process.env.EXPO_PUBLIC_KYC_API_KEY || 'sk_daec2a91-dfa0-46fd-9957-d7cbfdf878a1',
  baseUrl: process.env.EXPO_PUBLIC_KYC_BASE_URL || 'https://developers.kyciris.com',
};

export default function BackDocumentStep() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { verificationId, backDocument, setBackDocument, setStep } = useVerificationStore();

  const requestPermissions = async () => {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraPermission.status !== 'granted' || libraryPermission.status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera and photo library permissions');
      return false;
    }
    return true;
  };

  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.uri) {
          setBackDocument(asset.uri);
        } else {
          const base64 = asset.base64 || '';
          const uri = `data:image/jpeg;base64,${base64}`;
          setBackDocument(uri);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const pickFromGallery = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.uri) {
          setBackDocument(asset.uri);
        } else {
          const base64 = asset.base64 || '';
          const uri = `data:image/jpeg;base64,${base64}`;
          setBackDocument(uri);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleUpload = async () => {
    if (!verificationId) {
      Alert.alert('Error', 'No verification ID');
      return;
    }
    if (!backDocument) {
      Alert.alert('Error', 'Take or select back document first');
      return;
    }

    setLoading(true);
    try {
      const client = createKYCClient(TEST_CREDENTIALS);
      await client.uploadDocument({
        verificationId,
        type: 'back',
        imageData: backDocument,
      });
      setStep('selfie');
      router.push('/selfie-step');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Step 3: Back Document</Text>
        <Text style={styles.description}>Take a photo or upload the back of your ID</Text>

        {backDocument ? (
          <Image source={{ uri: backDocument }} style={styles.preview} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>No image selected</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.halfButton} onPress={takePhoto}>
            <Text style={styles.halfButtonText}>📷 Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.halfButton} onPress={pickFromGallery}>
            <Text style={styles.halfButtonText}>🖼️ Upload</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, (!backDocument || loading) && styles.buttonDisabled]}
          onPress={handleUpload}
          disabled={!backDocument || loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Uploading...' : 'Continue'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => {
            setStep('selfie');
            router.push('/selfie-step');
          }}
        >
          <Text style={styles.skipText}>Skip</Text>
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
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
  },
  placeholder: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  placeholderText: {
    color: '#6B7280',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  halfButton: {
    flex: 1,
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  halfButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipText: {
    color: '#6B7280',
    fontSize: 14,
  },
});
