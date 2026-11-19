import { afterEach, describe, expect, it } from 'vitest';

import { assertDevDatabase } from '../../scripts/lib/assertDevDatabase';

const ENV_KEYS = [
  'DEV_DB_HOSTS',
  'DEV_DB_BRANCH',
  'DATABASE_URL',
  'DATABASE_MIGRATE_URL',
  'I_CONFIRM_DEV_DB',
  'VERCEL_ENV',
  'PROD_DB_HOSTS',
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (key in saved) {
      const v = saved[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
      delete saved[key];
    }
  }
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('assertDevDatabase', () => {
  it('rejects when DEV_DB_HOSTS is empty', () => {
    setEnv('DEV_DB_HOSTS', '');
    setEnv('DATABASE_URL', 'postgresql://u:p@ep-dev-pooler.us-east-1.aws.neon.tech/neondb');
    setEnv('I_CONFIRM_DEV_DB', '1');
    expect(() => assertDevDatabase({ refuseProductionEnv: false })).toThrow(
      /DEV_DB_HOSTS/,
    );
  });

  it('rejects hosts outside the allowlist', () => {
    setEnv('DEV_DB_HOSTS', 'ep-dev-pooler.us-east-1.aws.neon.tech');
    setEnv(
      'DATABASE_URL',
      'postgresql://u:p@ep-prod-pooler.us-east-1.aws.neon.tech/neondb',
    );
    setEnv('I_CONFIRM_DEV_DB', '1');
    expect(() => assertDevDatabase({ refuseProductionEnv: false })).toThrow(
      /not in DEV_DB_HOSTS/,
    );
  });

  it('rejects without confirm flag', () => {
    setEnv('DEV_DB_HOSTS', 'ep-dev-pooler.us-east-1.aws.neon.tech');
    setEnv('DATABASE_MIGRATE_URL', undefined);
    setEnv(
      'DATABASE_URL',
      'postgresql://u:p@ep-dev-pooler.us-east-1.aws.neon.tech/neondb',
    );
    setEnv('I_CONFIRM_DEV_DB', undefined);
    expect(() =>
      assertDevDatabase({
        refuseProductionEnv: false,
        urlEnvVars: ['DATABASE_URL'],
        argv: ['node', 'script.ts'],
      }),
    ).toThrow(/explicit confirm required/);
  });

  it('accepts allowlisted host with --confirm-dev-db', () => {
    setEnv('DEV_DB_HOSTS', 'ep-dev-pooler.us-east-1.aws.neon.tech');
    setEnv('DEV_DB_BRANCH', 'dev-main');
    setEnv('DATABASE_MIGRATE_URL', undefined);
    setEnv(
      'DATABASE_URL',
      'postgresql://u:p@ep-dev-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
    );
    const target = assertDevDatabase({
      refuseProductionEnv: false,
      urlEnvVars: ['DATABASE_URL'],
      argv: ['node', 'script.ts', '--confirm-dev-db'],
    });
    expect(target.host).toBe('ep-dev-pooler.us-east-1.aws.neon.tech');
    expect(target.database).toBe('neondb');
    expect(target.branchLabel).toBe('dev-main');
    expect(target.neonEndpoint).toBe('ep-dev');
  });

  it('prefers DATABASE_MIGRATE_URL when listed first', () => {
    setEnv('DEV_DB_HOSTS', 'ep-migrate.us-east-1.aws.neon.tech');
    setEnv(
      'DATABASE_MIGRATE_URL',
      'postgresql://u:p@ep-migrate.us-east-1.aws.neon.tech/neondb',
    );
    setEnv(
      'DATABASE_URL',
      'postgresql://u:p@ep-other.us-east-1.aws.neon.tech/neondb',
    );
    const target = assertDevDatabase({
      refuseProductionEnv: false,
      urlEnvVars: ['DATABASE_MIGRATE_URL', 'DATABASE_URL'],
      argv: ['node', 'script.ts', '--confirm-dev-db'],
    });
    expect(target.urlEnvVar).toBe('DATABASE_MIGRATE_URL');
    expect(target.host).toBe('ep-migrate.us-east-1.aws.neon.tech');
  });

  it('refuses VERCEL_ENV=production', () => {
    setEnv('VERCEL_ENV', 'production');
    setEnv('DEV_DB_HOSTS', 'ep-dev-pooler.us-east-1.aws.neon.tech');
    setEnv(
      'DATABASE_URL',
      'postgresql://u:p@ep-dev-pooler.us-east-1.aws.neon.tech/neondb',
    );
    setEnv('I_CONFIRM_DEV_DB', '1');
    expect(() => assertDevDatabase()).toThrow(/VERCEL_ENV=production/);
  });

  it('refuses a production host even when it is also in DEV_DB_HOSTS', () => {
    setEnv('DEV_DB_HOSTS', 'ep-prod-pooler.us-east-1.aws.neon.tech');
    setEnv('PROD_DB_HOSTS', 'ep-prod-pooler.us-east-1.aws.neon.tech');
    setEnv('DATABASE_URL', 'postgresql://u:p@ep-prod-pooler.us-east-1.aws.neon.tech/neondb');
    setEnv('DATABASE_MIGRATE_URL', undefined);
    setEnv('I_CONFIRM_DEV_DB', '1');
    expect(() => assertDevDatabase({ argv: [] })).toThrow(/production database/);
  });
});
