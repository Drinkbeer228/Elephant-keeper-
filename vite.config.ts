import {defineConfig} from 'vitest/config';

export default defineConfig({
  base: '/Elephant-keeper-/',
  build: { chunkSizeWarningLimit: 1600 },
  preview: { allowedHosts: ['.trycloudflare.com'] },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
