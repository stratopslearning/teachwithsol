/**
 * Safety gate for migration / seed / DB maintenance scripts.
 *
 * Refuses to run unless the target Postgres host is on DEV_DB_HOSTS
 * (comma-separated hostname allowlist) and the operator passes an explicit
 * confirm flag. Never use this in the Next.js request path — only in scripts.
 *
 * Usage (after loading dotenv):
 *   import { assertDevDatabaseOrExit } from './lib/assertDevDatabase';
 *   assertDevDatabaseOrExit();
 *
 * Confirm with either:
 *   --confirm-dev-db
 *   I_CONFIRM_DEV_DB=1
 */
import { pathToFileURL } from 'node:url';

export type DevDbTarget = {
  url: string;
  host: string;
  port: string | null;
  database: string;
  /** Neon endpoint id when host looks like ep-….neon.tech; else null. */
  neonEndpoint: string | null;
  /** Display-only branch label (DEV_DB_BRANCH or "unknown"). */
  branchLabel: string;
  urlEnvVar: string;
};

const CONFIRM_FLAG = '--confirm-dev-db';
const CONFIRM_ENV = 'I_CONFIRM_DEV_DB';

function parsePostgresUrl(raw: string): {
  host: string;
  port: string | null;
  database: string;
} {
  let normalized = raw.trim();
  if (normalized.startsWith('postgres://')) {
    normalized = `postgresql://${normalized.slice('postgres://'.length)}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Invalid database URL (cannot parse host): ${raw.slice(0, 32)}…`);
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`Expected postgres(ql) URL, got protocol ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (!host) {
    throw new Error('Database URL is missing a hostname');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'postgres');
  return {
    host,
    port: parsed.port || null,
    database,
  };
}

function neonEndpointFromHost(host: string): string | null {
  // ep-foo-bar-pooler.us-east-1.aws.neon.tech → ep-foo-bar
  const m = host.match(/^(ep-[a-z0-9-]+?)(?:-pooler)?\./i);
  return m?.[1] ?? null;
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function hostAllowed(host: string, allowlist: string[]): boolean {
  return allowlist.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

function hasConfirm(argv: string[]): boolean {
  if (argv.includes(CONFIRM_FLAG)) return true;
  const env = process.env[CONFIRM_ENV];
  return env === '1' || env === 'true' || env === 'yes';
}

export type AssertDevDatabaseOptions = {
  /** Env vars to read, in priority order. First non-empty wins. */
  urlEnvVars?: string[];
  argv?: string[];
  /**
   * When true (default), refuse if VERCEL_ENV or NODE_ENV claims production
   * for script execution. Override only in unit tests.
   */
  refuseProductionEnv?: boolean;
};

/**
 * Resolve and validate the target DB. Throws on failure (does not exit).
 */
export function assertDevDatabase(
  opts: AssertDevDatabaseOptions = {},
): DevDbTarget {
  const urlEnvVars = opts.urlEnvVars ?? [
    'DATABASE_MIGRATE_URL',
    'DATABASE_URL',
  ];
  const argv = opts.argv ?? process.argv;
  const refuseProductionEnv = opts.refuseProductionEnv !== false;

  if (refuseProductionEnv) {
    if (process.env.VERCEL_ENV === 'production') {
      throw new Error(
        'Refusing DB script: VERCEL_ENV=production. Use a local/dev Neon host only.',
      );
    }
  }

  const allowlist = parseAllowlist(process.env.DEV_DB_HOSTS);
  if (allowlist.length === 0) {
    throw new Error(
      'DEV_DB_HOSTS is unset or empty. Set it to a comma-separated allowlist of Neon hostnames (e.g. ep-xxx-pooler.us-east-1.aws.neon.tech) before running migration/seed/db scripts.',
    );
  }

  let url: string | undefined;
  let urlEnvVar = '';
  for (const key of urlEnvVars) {
    const v = process.env[key]?.trim();
    if (v) {
      url = v;
      urlEnvVar = key;
      break;
    }
  }
  if (!url) {
    throw new Error(
      `No database URL set. Expected one of: ${urlEnvVars.join(', ')}`,
    );
  }

  const { host, port, database } = parsePostgresUrl(url);
  // Production hosts are refused even if they also appear in DEV_DB_HOSTS.
  // Prod migrations go through scripts/prod-migrate.ts instead.
  const prodHosts = parseAllowlist(process.env.PROD_DB_HOSTS);
  if (hostAllowed(host, prodHosts)) {
    throw new Error(
      `Refusing DB script: host "${host}" is a production database (PROD_DB_HOSTS). Use scripts/prod-migrate.ts for prod.`,
    );
  }
  if (!hostAllowed(host, allowlist)) {
    throw new Error(
      `Refusing DB script: host "${host}" is not in DEV_DB_HOSTS allowlist [${allowlist.join(', ')}].`,
    );
  }

  const neonEndpoint = neonEndpointFromHost(host);
  const branchLabel =
    process.env.DEV_DB_BRANCH?.trim() ||
    process.env.NEON_BRANCH_NAME?.trim() ||
    'unknown (set DEV_DB_BRANCH to label this Neon branch)';

  if (!hasConfirm(argv)) {
    throw new Error(
      [
        'Refusing DB script: explicit confirm required.',
        `  Target host:     ${host}${port ? `:${port}` : ''}`,
        `  Database:        ${database}`,
        `  Neon endpoint:   ${neonEndpoint ?? '(not a neon ep-* host)'}`,
        `  Branch label:    ${branchLabel}`,
        `  URL from:        ${urlEnvVar}`,
        `Re-run with ${CONFIRM_FLAG} or ${CONFIRM_ENV}=1 after verifying the target.`,
      ].join('\n'),
    );
  }

  return {
    url,
    host,
    port,
    database,
    neonEndpoint,
    branchLabel,
    urlEnvVar,
  };
}

/**
 * Validate, print target, or exit(1). Call at the top of DB scripts.
 */
export function assertDevDatabaseOrExit(
  opts: AssertDevDatabaseOptions = {},
): DevDbTarget {
  try {
    const target = assertDevDatabase(opts);
    console.log('[dev-db-guard] OK');
    console.log(`  host:     ${target.host}${target.port ? `:${target.port}` : ''}`);
    console.log(`  database: ${target.database}`);
    console.log(`  endpoint: ${target.neonEndpoint ?? 'n/a'}`);
    console.log(`  branch:   ${target.branchLabel}`);
    console.log(`  url env:  ${target.urlEnvVar}`);
    return target;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dev-db-guard] ${message}`);
    process.exit(1);
  }
}

/** True when this file is executed directly (smoke / self-check). */
const isMain =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isMain) {
  assertDevDatabaseOrExit();
}
