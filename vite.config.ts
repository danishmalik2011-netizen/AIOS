/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
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
    }),
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
