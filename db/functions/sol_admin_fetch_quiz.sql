-- Live definition of sol_admin_fetch_quiz() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_fetch_quiz(p_quiz_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT to_jsonb(q.*) FROM quizzes q WHERE q.id = p_quiz_id;
$$;
REVOKE ALL ON FUNCTION sol_admin_fetch_quiz(uuid) FROM PUBLIC;
