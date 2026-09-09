import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Project Pages liegen unter /<repo>/, nicht unter /.
// Im Dev-Server soll die Basis '/' bleiben.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/InfiniteCatan/' : '/',
  plugins: [react()],
  // Port aus der Umgebung, damit ein bereits belegter Standardport nicht
  // den Start verhindert.
  server: { port: Number(process.env.PORT) || 5173 },
  build: { target: 'es2022', outDir: 'dist' },
}));
