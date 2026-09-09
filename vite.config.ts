import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Project Pages liegen unter /<repo>/, nicht unter /.
// Im Dev-Server soll die Basis '/' bleiben.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/InfiniteCatharge/' : '/',
  plugins: [react()],
  // Port aus der Umgebung, damit ein bereits belegter Standardport nicht
  // den Start verhindert.
  server: { port: Number(process.env.PORT) || 5173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Kacheln NIE als base64 ins Skript einbetten.
    //
    // Vite bettet Dateien unter 4 KiB standardmaessig ein. Alle 48 Kacheln
    // liegen darunter, wodurch der Bundle von 227 auf 295 KiB wuchs (gzip
    // 72 -> 120). Das hat drei Nachteile: das Spiel laedt alle Kacheln,
    // bevor die erste Zeile Code laeuft; der Browser kann sie nicht getrennt
    // vom Code cachen, also gehen sie bei jeder Codeaenderung erneut ueber
    // die Leitung; und base64 ist rund 37 % groesser als die Binaerform.
    //
    // Dieselbe Lehre steht schon in der vite.config des Nachbarprojekts
    // InfiniteSettler - hier ist sie nur teurer, weil es 48 Dateien sind.
    assetsInlineLimit: 0,
  },
}));
