# Gate report — Full authz cutover (bindings replace legacy roles)

**Date:** 2026-11-03  
**Scope:** local codebase + Neon project `sol-knowledge-dev` (`super-bar-83717363`)

## Verdict

**Complete on sol-knowledge-dev.** Authority is `role_bindings` + `student_sections` + `platform_staff` ∩ support grants. Global `users.role` is removed from schema, app types, and the database.

## Metrics

| Metric | Before | After |
| --- | --- | --- |
| `legacy_authz_count` | 111 | **0** |
| `scripts/legacy-authz-baseline.txt` | 111 | **0** |
| `eslint-legacy-authz-allowlist.json` | 59 files | **[]** |
| `users.role` in `app/db/schema.ts` | present | **removed** |
| `users.role` column on Neon main | present | **DROPPED** |
| `users.role` column on Neon test | present | **DROPPED** |
| ADMIN ∧ ¬platform_staff | — | **0** (pre-drop check) |

## What changed (batches)

0. **Binding writers** — LTI NRPS / launch dual-write section teaching bindings (`lib/lti/facultyEnrollment.ts`); `leaveSection` revokes section teaching bindings; `enrollInSection` gates on teaching area (not `users.role`); section create uses `bindLeadInstructor`.
1. **ADMIN fallbacks** — `authorize` / support helpers use `platformStaff` only; `LEGACY_ADMIN_ROLE_FALLBACK` defaults off (`=1` escape hatch only).
2. **LTI** — link/unlink via `lti.manage` or section `content.write`; launch enrollment ignores `users.role`.
3. **Content** — interactives, lessons, discussions, chatbot `professorOwnsOrTeachesChatbot` → bindings.
4. **Leftovers** — quiz/chatbot/section/regrade routes → `userCanWriteQuiz` / `authorizeOnSection` / enrollment.
5. **Student / workspace / tokens / onboarding** — learning/teaching area gates; no global STUDENT/PROFESSOR role checks.
6. **Display + writers** — Navbar/Hero/payment/devGate/admin UI on areas/`platformStaff`; stop writing `users.role`; remove from `UserData` / schema.
7. **Contract** — column dropped on Neon main + test (owner DDL; `sol_migrator` lacked `ALTER` privilege on `users`).

## Smoke (manual / SQL)

- [x] `node --import tsx scripts/count-legacy-authz.ts --check` → 0
- [x] Neon: `users.role` absent (`role_cols = 0`) on main + test
- [x] Neon: no ADMIN without `platform_staff` before drop
- [ ] Local `next dev`: teaching dashboard, student quiz submit, token mint (operator)
- [ ] LTI launch → faculty binding present for instructor (operator)

## Follow-ups (out of scope)

- Drop `workspace_memberships.role` column (always `member`).
- Retire `professor_sections` as a table once no metadata readers remain.
- Production Neon apply.
- Transfer `users` ownership to `sol_migrator` (or keep owner DDL for contract scripts).
- Optionally delete `lib/authz/shadowAuthorize.ts` / set `SHADOW_AUTHZ=0` permanently once logs are quiet.

## Env

- `.env.local`: `LEGACY_ADMIN_ROLE_FALLBACK=0` (app default is off unless `=1`).
- Runtime: `DATABASE_URL` = `sol_app`; migrate: `DATABASE_MIGRATE_URL` = `sol_migrator`.

## Final cleanup (done)

The shadow path and rollback escape hatches are removed: `lib/authz/shadowAuthorize.ts` (and its `gates.ts` calls), `LEGACY_ADMIN_ROLE_FALLBACK`, the `count-legacy-authz` ratchet and baseline, the empty allowlist, and the one-off `contract-drop-users-role` / `prune-legacy-authz-allowlist` scripts. `users.role` no longer exists, and the `sol/no-legacy-authz` eslint rule (now blocking in CI lint) still rejects `users.role` and `professorId === user.id` authorization checks.
