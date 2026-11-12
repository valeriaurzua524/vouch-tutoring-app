import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      BCRYPT_ROUNDS: '4',
      ALLOW_TAMPER_DEMO: 'true',
      CAMPUS_EMAIL_DOMAIN: 'cpp.edu',
      ANTHROPIC_API_KEY: '',
      DATABASE_URL: '',
    },
  },
});
