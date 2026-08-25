import { defineConfig } from 'vitest/config';

/**
 * Separate from vite.config.mts on purpose.
 *
 * That config sets `root: 'playground'` so the dev harness is what gets served,
 * and vitest picks up a vite config when there is no vitest one — which made it
 * hunt for specs under playground/ and find none. Two roots, two files.
 */
export default defineConfig({
  test: {
    root: '.',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
