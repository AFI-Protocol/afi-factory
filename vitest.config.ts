import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // CLI behaviour tests exec the built dist/ CLI via child_process.
    testTimeout: 30000,
  },
});
