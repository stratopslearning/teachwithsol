# Testing

SOL’s automated confidence comes from **Vitest only** (no Playwright / browser E2E).

## Commands

| Command | What runs |
| --- | --- |
| `npm test` | **unit** project — pure logic, no DB |
| `npm run test:db` | **db** project — isolation, integration, `tests/db/**` (needs `TEST_DATABASE_URL`) |
| `npm run test:all` | unit then db |
| `npm run test:isolation` | alias into the db project’s isolation paths |

## Projects (`vitest.config.ts`)

- **unit** — `tests/unit/**` (+ grading cache tenant unit under isolation).
- **db** — `tests/db/**`, `tests/isolation/**`, `tests/integration/**`.  
  When `CI=true`, missing `TEST_DATABASE_URL` **fails** (`tests/setup-db-guard.ts`). Locally, DB suites use `describe.skipIf(!TEST_DATABASE_URL)`.

## Fixture rules

Use [`tests/helpers/factories.ts`](../tests/helpers/factories.ts) and [`seedTenantGraph`](../tests/helpers/seedTenantFixture.ts):

- Always set **`tenant_id`** on teaching rows.
- Always create a **`course_offerings`** row before / with sections (`makeCourseWithOffering` / `makeOffering`).
- Authority in fixtures: **`role_bindings` + `student_sections`** (membership is seat-only `member`).
- SKUs: `seedTenantGraph({ sku: 'creator' | 'department' | 'institution' })`.  
  Sibling depts: `seedSiblingDepartments(db)`.

`scripts/seed-dev.ts` follows the same tenant/offering stamps for local smoke.

## What green CI proves

1. **Unit contracts** — permissions catalog, grading, quiz policies, MCP auth, shadowAuthorize, SKU pricing, etc.
2. **FORCE RLS + bindings** on ephemeral Postgres as `sol_app` (`isolation-pgvector` job runs `npm run test:db` + `check:tenant-schema`).
3. **Leaf tenancy** — creator / department / institution stamp `tenant_id = teaching workspace id`; institution parent is soft hierarchy only; sibling departments isolated.
4. **Roles** — binding matrix, offering vs section scopes, support grants for platform staff.
5. **Workflow contracts** — provision per SKU, course stamp, enroll/cap/co-instructor source contracts (some encode known product debt until fixed).

It does **not** prove UI clicks, live Canvas LTI, or deterministic LLM scores (Braintrust evals are nightly).

## CI map (`.github/workflows/ci.yml`)

| Job | Role |
| --- | --- |
| `typecheck` | `tsc` |
| `test` | Always `npm test` (unit); optional Neon `test:db` if secret set |
| `isolation-pgvector` | **Required** ephemeral Postgres: migrate → `sol_app` → `npm run test:db` → tenant-schema |
| `tenant-schema` | `check:tenant-schema` when Neon URL present |
| `lint` | `next lint` (errors fail the build; warnings are backlog) + legacy-authz ratchet |

## Adding tests

- Pure logic → `tests/unit/`.
- Needs Postgres / RLS / authorize against real bindings → `tests/db/` with `describe.skipIf(!process.env.TEST_DATABASE_URL)`.
- Prefer `seedTenantGraph` over hand-rolled inserts.
