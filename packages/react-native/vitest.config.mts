import { defineConfig } from 'vitest/config';

// Only the pure modules are tested here (capture-plan, capture-queue); the
// components need a device and a camera.
export default defineConfig({
  test: {
    root: '.',
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
