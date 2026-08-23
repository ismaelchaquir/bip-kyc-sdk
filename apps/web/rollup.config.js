import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.tsx',
  output: [
    {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true,
    },
    {
      file: 'dist/index.mjs',
      format: 'esm',
      sourcemap: true,
    },
  ],
  plugins: [
    resolve({
      browser: true,
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist',
      outDir: 'dist',
      exclude: ['../../packages/**'],
    }),
  ],
  external: [
    'react',
    'react-dom',
    // The workspace package name. This said '@bipkyc/core' — a name that has
    // not existed since the rename — so rollup silently INLINED core and axios
    // into the bundle instead of leaving them as imports. A consumer using both
    // this SDK and @bipdelivery/core directly got two copies with two separate
    // module states.
    '@bipdelivery/core',
    // Never bundled: it carries its own WASM loader, it is large, and a host
    // app using MediaPipe elsewhere must not end up with two runtimes fighting
    // over the same GPU delegate.
    '@mediapipe/tasks-vision',
  ],
};
