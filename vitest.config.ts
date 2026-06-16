import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    clearMocks: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/worker/**/*.ts'],
      exclude: [
        'src/worker/**/*.test.ts',
        'src/worker/env.d.ts',
        // db/client.ts is mocked in all tests — coverage is not meaningful
        'src/worker/db/client.ts',
        // JWT crypto core (fetchJwks, verifyJwt, importRsaPublicKey) requires
        // Web Crypto API (crypto.subtle) unavailable in Node test environment.
        // The middleware control flow (DEV bypass, user lookup) is covered via
        // auth.test.ts using DEV_USER_EMAIL.
        'src/worker/test/**',
      ],
    },
  },
});
