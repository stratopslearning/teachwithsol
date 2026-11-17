import { neonConfig, Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool as PgPool } from 'pg';
import ws from 'ws';

import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const connectionString = process.env.DATABASE_URL;

function isLocalPostgresHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

// Ephemeral CI / local Docker Postgres needs TCP via `pg`. Neon serverless
// (websocket + fetch) only works against Neon/Vercel/Supabase remotes.
const useTcpPg = isLocalPostgresHost(connectionString);

if (!useTcpPg) {
  // Always use the `ws` package for Neon transactions. Node 22+ ships a global
  // WebSocket (undici) that does not reliably keep session state across
  // `BEGIN` / `set_config` / DML in Pool transactions — which breaks RLS GUCs
  // (`app.tenant_id`) during workspace provisioning and withTenant().
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;

  // Prefer HTTP fetch for *non-transaction* pooled queries. Neon idle WebSockets
  // produce "Connection terminated unexpectedly" (and ws/bufferUtil flakes under
  // Next bundling). Authoring writes that need FORCE RLS use SECURITY DEFINER
  // functions over this HTTP path so they don't depend on sticky GUC sessions.
  if (typeof neonConfig.poolQueryViaFetch !== 'undefined') {
    neonConfig.poolQueryViaFetch = true;
  }
}

// One Pool per Lambda/edge instance. Cap at 1 connection: the default node-pg
// `max` of 10 times hundreds of warm Vercel instances exhausts Neon compute
// (≈100 connections at 0.25 CU). Prefer Neon's pooled (`-pooler`) DATABASE_URL.
declare global {
  // eslint-disable-next-line no-var
  var __neonPool__: NeonPool | PgPool | undefined;
  // eslint-disable-next-line no-var
  var __neonPoolErrorBound__: boolean | undefined;
}

if (
  connectionString &&
  !connectionString.includes('-pooler') &&
  process.env.NODE_ENV === 'production' &&
  !useTcpPg
) {
  console.warn(
    'DATABASE_URL does not look like a Neon pooled (-pooler) connection string. Under serverless load this can exhaust compute connections.',
  );
}

// Vercel/serverless: one connection per isolate (many isolates × default max 10
// exhausts Neon). Long-running Node (next dev / next start): allow a small pool
// so concurrent exam traffic is not fully serialized.
const isServerless = Boolean(process.env.VERCEL);
const poolMax = Number(process.env.PG_POOL_MAX) || (isServerless ? 1 : 10);

export const pool =
  globalThis.__neonPool__ ??
  (useTcpPg
    ? new PgPool({
        connectionString,
        max: poolMax,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 10_000,
      })
    : new NeonPool({
        connectionString,
        max: poolMax,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 10_000,
      }));

if (!globalThis.__neonPoolErrorBound__) {
  pool.on('error', (error: Error) => {
    // Idle-client disconnects are expected with Neon's proxy. Swallow so they
    // do not become unhandled 'error' events; the next query opens a new socket.
    console.error(useTcpPg ? '[db] pg pool error' : '[db] neon pool error', error);
  });
  globalThis.__neonPoolErrorBound__ = true;
}

if (process.env.NODE_ENV !== 'production' || isServerless) {
  globalThis.__neonPool__ = pool;
}

/**
 * Drizzle bound to one checked-out connection, so every statement shares one
 * database session (used by withTenant for transaction-local RLS settings).
 */
export function drizzleOnClient(client: unknown) {
  return useTcpPg
    ? drizzlePg(client as import('pg').PoolClient, { schema })
    : drizzleNeon(client as import('@neondatabase/serverless').PoolClient, { schema });
}

// Both drivers expose a compatible Drizzle surface for our query patterns.
export const db = useTcpPg
  ? drizzlePg(pool as PgPool, { schema })
  : drizzleNeon(pool as NeonPool, { schema });

// Export schema for use in other files
export * from './schema';
