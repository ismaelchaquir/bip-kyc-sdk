import { useEffect, useState } from 'react';
import { useCameraDevice } from 'react-native-vision-camera';
import type { CameraDevice, TargetCameraPosition } from 'react-native-vision-camera';

/** How long to wait for the native device factory before calling it missing. */
const RESOLVE_TIMEOUT_MS = 5000;

export interface ResolvedCameraDevice {
  /** The device to hand to `<Camera device={...} />`, once it exists. */
  device: CameraDevice | undefined;
  /** True once we have waited long enough to say this phone has no such camera. */
  unavailable: boolean;
}

/**
 * Resolve a camera by position without crashing the screen.
 *
 * `<Camera device="back" />` throws during render while the device list is
 * still empty, and it is empty until the native device factory resolves — which
 * can still be pending on the first render after the user opens the camera.
 * `useCameraDevice` returns `undefined` in that window instead, so the caller
 * can show a spinner. `undefined` is also what a phone with no camera on that
 * side returns, so the wait is time-boxed to tell the two apart.
 */
export function useResolvedCameraDevice(position: TargetCameraPosition): ResolvedCameraDevice {
  const device = useCameraDevice(position);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (device != null) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), RESOLVE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [device]);

  return { device, unavailable: device == null && timedOut };
}
