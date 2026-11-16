-- Live definition of sol_update_attempt_score() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_update_attempt_score(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt uuid := (p_payload->>'attemptId')::uuid;
  v_tenant uuid;
BEGIN
  IF v_attempt IS NULL THEN
    RAISE EXCEPTION 'attemptId required';
  END IF;
  SELECT tenant_id INTO v_tenant FROM attempts WHERE id = v_attempt;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  UPDATE attempts SET
    score = (p_payload->>'score')::integer,
    max_score = (p_payload->>'maxScore')::integer,
    percentage = (p_payload->>'percentage')::integer,
    passed = (p_payload->>'passed')::boolean
  WHERE id = v_attempt;
END;
$$;
REVOKE ALL ON FUNCTION sol_update_attempt_score(jsonb) FROM PUBLIC;
