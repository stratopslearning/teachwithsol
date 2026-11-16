/**
 * Vitest global setup.
 *
 * - Loads .env / .env.local (so DATABASE_URL etc. are populated) if they
 *   exist locally.
 * - Stamps default test credentials so importing modules that read
 *   `process.env` at module-load time (e.g. lib/stripe, lib/env) don't
 *   crash. Real CI sets these via repository secrets.
 * - Polyfills the WebSocket constructor for @neondatabase/serverless when
 *   integration tests connect.
 */
import { config as loadEnv } from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '.env.local', override: true, quiet: true });

// Unit tests mock the OpenAI SDK; Braintrust's wrapOpenAI cannot proxy those
// mocks. Keep tracing off in Vitest regardless of a local .env key.
delete process.env.BRAINTRUST_API_KEY;

const DEFAULT_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  CLERK_SECRET_KEY: 'sk_test_dummy',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_dummy',
  STRIPE_SECRET_KEY: 'sk_test_dummy_stripe',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
  STRIPE_PRICE_ID: 'price_test_dummy',
  OPENAI_API_KEY: 'sk-test-dummy',
  NEXT_PUBLIC_BASE_URL: 'http://localhost:3000',
};

for (const [key, value] of Object.entries(DEFAULT_ENV)) {
  if (!process.env[key]) process.env[key] = value;
}

// Unit project must load modules that import `@/app/db` / `lib/env` without a
// real database. CI often injects empty secrets.TEST_DATABASE_URL as "".
// This stub is never meant to be connected — unit tests mock DB I/O.
const UNIT_DB_STUB =
  'postgresql://unit_unused:unit@127.0.0.1:5432/unit_unused';
if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = UNIT_DB_STUB;
}
// Record whether a real test database was provided BEFORE stubbing, so DB
// suites can skip (locally) or fail (in CI) instead of hitting the stub.
if (process.env.TEST_DATABASE_URL?.trim()) {
  process.env.SOL_REAL_TEST_DB = '1';
} else {
  process.env.TEST_DATABASE_URL = UNIT_DB_STUB;
}

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws as any;
}

export { hasTestDb } from './helpers/testDb';
