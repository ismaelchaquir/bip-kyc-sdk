import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'BipDelivery KYC' }} />
        {/* The capture screens are full-bleed camera views; a header over one
            just covers the prompt the applicant is meant to read. */}
        <Stack.Screen name="step-example" options={{ title: 'LivenessStep', headerShown: false }} />
        <Stack.Screen
          name="capture-example"
          options={{ title: 'LivenessCapture', headerShown: false }}
        />
        <Stack.Screen name="core-example" options={{ title: 'Core + your UI', headerShown: false }} />
      </Stack>
    </>
  );
}
