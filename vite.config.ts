import { defineConfig } from 'vitest/config';

export default defineConfig({
  // three.js อย่างเดียวก็ ~500 kB แล้ว
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
