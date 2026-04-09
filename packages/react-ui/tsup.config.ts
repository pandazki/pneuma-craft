import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  external: [
    'react',
    'react-dom',
    '@pneuma-craft/core',
    '@pneuma-craft/timeline',
    '@pneuma-craft/react',
  ],
});
