-- Live definition of sol_list_grade_overrides() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_grade_overrides(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM attempts WHERE id = p_attempt_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', g.id,
      'attemptId', g.attempt_id,
      'tenantId', g.tenant_id,
      'questionId', g.question_id,
      'numericScore', g.numeric_score,
      'criteriaOverrides', g.criteria_overrides,
      'note', g.note,
      'actorUserId', g.actor_user_id,
      'createdAt', g.created_at
    ) ORDER BY g.created_at ASC)
    FROM grade_overrides g
    WHERE g.attempt_id = p_attempt_id
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION sol_list_grade_overrides(uuid) FROM PUBLIC;
