import { execSync } from 'node:child_process';
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
function buildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  root: 'playground',
  // Served under a path on the existing kyc host rather than its own subdomain,
  // so no new DNS record is needed. Vite has to know, or every asset URL comes
  // out absolute-from-root and 404s.
  base: '/liveness/',
  build: {
    outDir: '../playground-dist',
    emptyOutDir: true,
    rollupOptions: {
      // Two pages, one build: index.html drives the flow with core call by
      // call, managed.html hands the same flow to <KYCWeb />.
      input: {
        index: 'playground/index.html',
        managed: 'playground/managed.html',
      },
    },
  },
  plugins: [react(), basicSsl()],
  // Stamped into the page so the running build is visible on the device.
  // Without it a stale cached index.html is indistinguishable from a fix that
  // did not work — which cost a full investigation once, on a phone that held
  // the same manifest across three deploys.
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
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
