// Load .env if present (Node >= 20.12). Real environment variables win.
try {
  process.loadEnvFile();
} catch {
  /* no .env file: defaults apply */
}

const env = process.env;
const bool = (v: string | undefined, dflt: boolean) =>
  v === undefined || v === '' ? dflt : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const isProd = env.NODE_ENV === 'production';

if (isProd && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  isProd,
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL || null,
  pgliteDir: env.PGLITE_DIR ?? '.data/pglite',
  jwtSecret: env.JWT_SECRET ?? 'dev-only-secret-do-not-deploy',
  jwtTtl: '12h' as const,
  bcryptRounds: Number(env.BCRYPT_ROUNDS ?? 10),
  campusDomain: (env.CAMPUS_EMAIL_DOMAIN ?? 'cpp.edu').toLowerCase(),
  corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
  // The bypass tamper action exists for the graded demo. Off by default in production.
  allowTamperDemo: bool(env.ALLOW_TAMPER_DEMO, !isProd),
  enforceSessionTime: bool(env.ENFORCE_SESSION_TIME, false),
  // Creates the demo accounts at startup (see src/db/seed.ts). Never in production.
  seedDemo: bool(env.SEED_DEMO, false) && !isProd,
  llmKey: env.ANTHROPIC_API_KEY || null,
  llmModel: env.LLM_MODEL ?? 'claude-haiku-5-5',
};
