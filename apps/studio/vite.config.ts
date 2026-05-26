import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist-vite',
    emptyOutDir: true,
  },
});
