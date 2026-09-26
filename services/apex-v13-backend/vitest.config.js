import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    /* node env (pas happy-dom) car Worker n'a pas besoin du DOM
     * et happy-dom strip l'header Origin lors création Request (sécurité forge) */
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
