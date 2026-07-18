/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'path';

// On Vercel we only build the web SPA — skip the Electron main/preload
// plugins (they require native modules / the electron binary which are
// unavailable in the Vercel build environment).
const isVercel = !!process.env.VERCEL || !!process.env.SKIP_ELECTRON;

const electronPlugin = isVercel
  ? []
  : electron({
      main: {
        entry: ['electron/main.ts', 'electron/pty-worker.ts'],
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'node-pty', 'simple-git'],
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs'
              }
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs'
              }
            },
          },
        },
      },
      renderer: {},
    });

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electronPlugin,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'flow-vendor': ['@xyflow/react'],
          'charts-vendor': ['recharts'],
        },
      },
    },
  },
});
