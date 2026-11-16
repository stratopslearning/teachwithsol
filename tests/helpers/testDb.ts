/**
 * True when a real TEST_DATABASE_URL was provided (tests/setup.ts stubs the
 * variable for the unit project, so checking it directly is always truthy).
 * DB suites use `describe.skipIf(!hasTestDb())`; in CI the db project fails
 * instead of skipping (tests/setup-db-guard.ts).
 */
export function hasTestDb(): boolean {
  return process.env.SOL_REAL_TEST_DB === '1';
}
