import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'zustand',
    'zustand/vanilla',
    '@pneuma-craft/core',
    '@pneuma-craft/timeline',
    '@pneuma-craft/video',
  ],
});
