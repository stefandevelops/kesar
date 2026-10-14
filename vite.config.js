import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/kesar/' : '/',
  build: { chunkSizeWarningLimit: 650 },
  server: {
    port: 5175,
    watch: { usePolling: true, interval: 300 },
  },
}));
