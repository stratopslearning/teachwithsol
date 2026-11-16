-- Live definition of sol_admin_purge_quiz() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_purge_quiz(p_quiz_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM quizzes WHERE id = p_quiz_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz not found'; END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  DELETE FROM quizzes WHERE id = p_quiz_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_admin_purge_quiz(uuid) FROM PUBLIC;
