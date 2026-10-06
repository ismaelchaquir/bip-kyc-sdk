import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

export interface DocumentCameraProps {
  title: string;
  hint: string;
  busy: boolean;
  /** Called with a file:// uri once the applicant accepts the photo. */
  onSubmit: (uri: string) => void;
  onCancel: () => void;
}

/**
 * Document capture, written by the app rather than taken from the SDK.
 *
 * The SDK has no document camera: the document step is a plain upload, so
 * anything that produces an image works. This is the camera the izzo flow uses —
 * frame the card, shoot, look at it, retake or submit — and it is here to show
 * what "bring your own UI" means for the half of the flow the SDK does not own.
 *
 * Resolution is deliberately high: OCR reads 6-point MRZ characters, and a
 * preview-sized still loses them.
 */
export function DocumentCamera({ title, hint, busy, onSubmit, onCancel }: DocumentCameraProps) {
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [photo, setPhoto] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const mounted = useRef(true);

  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.UHD_4_3,
    containerFormat: 'jpeg',
    quality: 0.9,
    qualityPrioritization: 'quality',
  });

  useEffect(() => {
    if (!hasPermission && canRequestPermission) void requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);

  useEffect(() => {
    photoOutput.prepareSettings([{ flashMode: 'off' }]);
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outputs = useMemo(() => [photoOutput], [photoOutput]);

  const take = async () => {
    setCapturing(true);
    try {
      const file = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      if (mounted.current) setPhoto(`file://${file.filePath}`);
    } catch (error) {
      console.warn('[document] capture failed', error);
    }
    if (mounted.current) setCapturing(false);
  };

  if (!hasPermission) {
    return (
      <View style={styles.centred}>
        <Text style={styles.heading}>Camera access needed</Text>
        <Text style={styles.body}>The card is photographed on the device; nothing is uploaded until you accept it.</Text>
        <TouchableOpacity style={styles.primary} onPress={onCancel}>
          <Text style={styles.primaryText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Shown once the photo exists: the applicant decides whether it is readable.
  if (photo) {
    return (
      <View style={styles.fill}>
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Is every line readable?</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.secondary, busy && styles.disabled]}
              onPress={() => setPhoto(null)}
              disabled={busy}
            >
              <Text style={styles.secondaryText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primary, busy && styles.disabled]}
              onPress={() => onSubmit(photo)}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Submit</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        outputs={outputs}
        isActive
        orientationSource="interface"
      />
      {/* A frame to aim at. The card should fill it: OCR fails on a card that is
          a tenth of the picture far more often than on a slightly tilted one. */}
      <View style={styles.guideWrap} pointerEvents="none">
        <View style={styles.guide} />
      </View>
      <View style={styles.header} pointerEvents="none">
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerHint}>{hint}</Text>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.shutter, capturing && styles.disabled]}
          onPress={() => void take()}
          disabled={capturing}
        >
          {capturing ? <ActivityIndicator color="#111827" /> : <View style={styles.shutterInner} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  centred: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  heading: { color: '#fff', fontSize: 20, fontWeight: '700' },
  body: { color: '#D1D5DB', fontSize: 14, textAlign: 'center' },
  header: { position: 'absolute', top: 60, left: 24, right: 24, gap: 6 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerHint: { color: '#D1D5DB', fontSize: 14 },
  guideWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  guide: {
    width: '86%',
    aspectRatio: 1.58, // ID-1, the card the MZ BI is printed on
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 14,
  },
  footer: { position: 'absolute', left: 24, right: 24, bottom: 48, alignItems: 'center', gap: 16 },
  footerTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E5E7EB' },
  primary: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.6 },
  cancel: { color: '#9CA3AF', fontSize: 14 },
});
