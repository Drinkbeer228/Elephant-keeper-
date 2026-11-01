import {defineConfig} from 'vitest/config';

export default defineConfig({
  base: './',
  // Phaser целиком весит ~1,2 МБ, это ожидаемо
  build: { chunkSizeWarningLimit: 1600 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
