import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // ts-morph builds a type checker for the fixture project; give it room on cold runs.
    testTimeout: 20_000,
  },
});
