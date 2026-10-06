import { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { KYCCore } from '@bipdelivery/core';

export interface DocumentUploadProps {
  client: KYCCore;
  verificationId: string;
  /** Both sides are uploaded before this is called. */
  onUploaded: () => void;
}

/**
 * Document step for the two examples whose subject is the selfie: the camera
 * here is the system one through expo-image-picker, which is enough to get a
 * readable card and keeps those examples about what they are about.
 *
 * The core-only example takes the other road and draws its own document camera.
 */
export function DocumentUpload({ client, verificationId, onUploaded }: DocumentUploadProps) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (from: 'camera' | 'library') => {
    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'The example needs the camera to photograph the card.');
      return;
    }

    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });

    if (!result.canceled && result.assets[0]?.uri) setImage(result.assets[0].uri);
  };

  const upload = async () => {
    if (!image) return;
    setBusy(true);
    try {
      await client.uploadDocument({ verificationId, type: side, imageData: image });
      setImage(null);
      if (side === 'front') setSide('back');
      else onUploaded();
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : String(error));
    }
    setBusy(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{side === 'front' ? 'Front of the card' : 'Back of the card'}</Text>
      <Text style={styles.hint}>
        Both sides are read by OCR. The back carries the MRZ, which is where the dates and the
        document number are taken from.
      </Text>

      {image ? (
        <Image source={{ uri: image }} style={styles.preview} />
      ) : (
        <View style={[styles.preview, styles.placeholder]}>
          <Text style={styles.placeholderText}>No photo yet</Text>
        </View>
      )}

      <View style={styles.row}>
        <TouchableOpacity style={styles.secondary} onPress={() => pick('camera')}>
          <Text style={styles.secondaryText}>Take photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => pick('library')}>
          <Text style={styles.secondaryText}>Choose file</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.primary, (!image || busy) && styles.disabled]}
        onPress={upload}
        disabled={!image || busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>{side === 'front' ? 'Upload front' : 'Upload back'}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  hint: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  preview: { width: '100%', height: 220, borderRadius: 12, marginBottom: 16 },
  placeholder: { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#6B7280' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  secondary: {
    flex: 1,
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryText: { color: '#fff', fontWeight: '600' },
  primary: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { backgroundColor: '#9CA3AF' },
});
