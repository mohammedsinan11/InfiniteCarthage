import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Project Pages liegen unter /<repo>/, nicht unter /.
// Im Dev-Server soll die Basis '/' bleiben.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/InfiniteCatan/' : '/',
  plugins: [react()],
  build: { target: 'es2022', outDir: 'dist' },
}));
