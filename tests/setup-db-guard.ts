/**
 * Fail fast in CI when the db project runs without a real TEST_DATABASE_URL
 * (no silent skip-and-green).
 */
import { hasTestDb } from './helpers/testDb';

if (process.env.CI === 'true' && !hasTestDb()) {
  throw new Error(
    'CI=true but TEST_DATABASE_URL is unset; the db project cannot skip in CI',
  );
}
