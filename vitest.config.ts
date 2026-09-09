import { defineConfig } from 'vitest/config';

// Die Dateien unter test/e2e laufen gegen einen echten Worker und werden
// deshalb nicht von der normalen Testsuite eingesammelt - sie brauchen ein
// gestartetes `npm run dev:worker`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
  },
});
