import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `SINGLE=1 vite build` inlines everything into one HTML file (used for the
// shareable test build); the default build is a normal multi-file PWA build.
const single = process.env.SINGLE === '1';

export default defineConfig({
  base: './',
  plugins: single ? [viteSingleFile()] : [],
  define: { __SINGLE_FILE__: JSON.stringify(single) },
  build: {
    outDir: single ? 'dist-single' : 'dist',
    target: 'es2022',
    assetsInlineLimit: single ? 100_000_000 : 4096,
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
} as never);
