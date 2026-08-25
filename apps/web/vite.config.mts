import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * Dev harness for the liveness capture. Not part of the published package —
 * `npm run build` still runs rollup over src/index.tsx and ignores this.
 *
 * `.mts` so vite loads it as ESM. The alternative, `"type": "module"` in
 * package.json, would change how the CJS half of the published bundle is
 * interpreted — a dev-only convenience is not worth touching that.
 *
 * HTTPS is not optional. getUserMedia only works in a secure context, and while
 * `localhost` counts as one, a LAN address does NOT — so a phone loading
 * http://192.168.x.x gets no camera at all, and the failure is a permission
 * error rather than anything that points at the cause. basic-ssl issues a
 * self-signed cert so the phone can reach the laptop over https.
 */
export default defineConfig({
  root: 'playground',
  plugins: [react(), basicSsl()],
  server: {
    // Bind every interface so a phone on the same wifi can reach it.
    host: true,
    port: 5180,
  },
  optimizeDeps: {
    // Pre-bundled so the first camera frame is not waiting on a cold
    // dependency scan of a large WASM-adjacent package.
    include: ['@mediapipe/tasks-vision'],
  },
});
