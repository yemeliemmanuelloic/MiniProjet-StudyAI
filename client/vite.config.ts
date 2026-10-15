/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  test: {
    // `environment` reste sur node par defaut : les tests de logique pure
    // n'ont pas besoin d'un DOM, et jsdom coute une seconde au demarrage.
    // Les fichiers qui montent des composants declarent eux-memes
    // `// @vitest-environment jsdom` en tete.
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
