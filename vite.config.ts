import {defineConfig} from 'vitest/config';

export default defineConfig({
  base: './',
  // Phaser целиком весит ~1,2 МБ, это ожидаемо
  build: { chunkSizeWarningLimit: 1600 },
  // npm run share: адреса quick tunnel от cloudflared
  preview: { allowedHosts: ['.trycloudflare.com'] },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
