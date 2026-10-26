import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // En GitHub Pages el sitio vive en /<repo>/ (ver .github/workflows/deploy.yml)
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  build: { sourcemap: false },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
