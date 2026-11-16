# ADR 0001: Tenant data access under FORCE RLS

Status: accepted (2026-11-16): typed definers
Date: 2026-11-16

## Context

Teaching tables use `FORCE ROW LEVEL SECURITY` keyed on `app.tenant_id`, and the
runtime role (`sol_app`) cannot bypass RLS. Code reaches the database three ways:
plain `db` (returns nothing under FORCE RLS unless a tenant is set), `withTenant`
(transaction-local `set_config`), and ~268 hand-written SECURITY DEFINER functions
with hand-written TypeScript mappers. About 32 of the last 261 commits were "fix X
under FORCE RLS". Code comments claim transaction-local settings are unreliable on
Neon's pooled serverless driver, which is why definers spread.

## Spike

`scripts/spike/tenant-gucs.ts`, run against a throwaway Neon branch of
`sol-knowledge-dev` as `sol_app` through the pooled (`-pooler`) endpoint. Each
withTenant op: `BEGIN; set_config(tenant, local); 3× SELECT current_setting + count(*)
from courses; COMMIT;` then checks the setting is gone. Each definer op: one
`resolve_lti_platform(...)` call. Run from a laptop, so absolute latency includes
network distance; compare ratios.

| Config | withTenant ok | withTenant p50 / p95 | definer p50 / p95 |
|---|---|---|---|
| 4 workers, pool 4, fetch | 100/100 | 605 / 679 ms | 77 / 85 ms |
| 50 workers, pool 10, fetch | 1000/1000 | 2,986 / 3,007 ms | 78 / 155 ms |
| 50 workers, pool 1, fetch (Vercel default) | 500/500 | 30,489 / 30,999 ms | 78 / 320 ms |
| 50 workers, pool 10, websocket only | 1000/1000 | 2,019 / 2,304 ms | 1,495 / 1,780 ms |

Findings:
1. **Correctness holds.** ~2,600 withTenant transactions: zero lost settings
   mid-transaction, zero leaked after commit, zero errors. The "flaky GUC on Neon"
   claim did not reproduce with the `ws` driver.
2. **Cost and contention don't.** A withTenant transaction holds a websocket pool
   connection for its whole life and pays extra round trips (BEGIN, set_config,
   COMMIT). Definers ride the HTTP fetch path and hold no connection. With
   `PG_POOL_MAX=1` (the serverless default), concurrent requests in one instance
   serialize behind each other's transactions (30 s vs 78 ms above).

## Decision

**Keep SECURITY DEFINER functions as the request-path data layer, and make them
cheap to maintain (plan branch B).** Use `withTenant` only where a multi-statement
atomic write or a background worker needs it.

- One SQL file per function under `db/functions/` (the live definition, not
  scattered across migrations); a script emits the `CREATE OR REPLACE` migration.
- Typed TS wrappers and row mappers generated from a small manifest and checked
  against `schema.ts` (`$inferSelect`), replacing the hand-written mappers.
- `withTenant` stays for multi-statement writes and workers (jobs, LTI drain),
  with a larger worker pool; combine `BEGIN` + `set_config` into one round trip.
- Lint: plain `@/app/db` only inside the data layer, migrations and scripts.

Rejected: moving the request path to `withTenant` everywhere (branch A). It is
correct, but holding a pooled connection per request costs roughly 8× latency
uncontended and serializes under concurrency at the pool sizes serverless allows.

## Consequences

- The LTI rework (plan 3.6) uses one cross-tenant claim definer plus per-tenant
  definers/withTenant writes in the drain worker.
- Existing definers stay; the generator replaces their mappers incrementally.
- The spike Neon branch `spike-tenant-gucs` can be deleted.
