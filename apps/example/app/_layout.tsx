import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'KYC Test App' }} />
        <Stack.Screen name="mobile-flow" options={{ title: 'Mobile Flow' }} />
        <Stack.Screen name="token-step" options={{ title: 'Create Token' }} />
        <Stack.Screen name="front-document" options={{ title: 'Front Document' }} />
        <Stack.Screen name="back-document" options={{ title: 'Back Document' }} />
        <Stack.Screen name="selfie-step" options={{ title: 'Selfie' }} />
        <Stack.Screen name="verification-complete" options={{ title: 'Complete' }} />
      </Stack>
    </>
  );
}
