-- Live definition of sol_insert_grade_override() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_insert_grade_override(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt uuid := (p_payload->>'attemptId')::uuid;
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
  v_question uuid := NULLIF(p_payload->>'questionId', '')::uuid;
  v_actor uuid := (p_payload->>'actorUserId')::uuid;
  v_note text := trim(COALESCE(p_payload->>'note', ''));
  v_row grade_overrides%ROWTYPE;
BEGIN
  IF v_attempt IS NULL OR v_tenant IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'attemptId, tenantId, actorUserId required';
  END IF;
  IF v_note = '' THEN
    RAISE EXCEPTION 'note required';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  INSERT INTO grade_overrides (
    attempt_id, tenant_id, question_id, numeric_score,
    criteria_overrides, note, actor_user_id
  ) VALUES (
    v_attempt,
    v_tenant,
    v_question,
    CASE WHEN p_payload ? 'numericScore' AND p_payload->>'numericScore' IS NOT NULL
      THEN (p_payload->>'numericScore')::integer ELSE NULL END,
    CASE WHEN p_payload ? 'criteriaOverrides' THEN p_payload->'criteriaOverrides' ELSE NULL END,
    v_note,
    v_actor
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'attemptId', v_row.attempt_id,
    'tenantId', v_row.tenant_id,
    'questionId', v_row.question_id,
    'numericScore', v_row.numeric_score,
    'criteriaOverrides', v_row.criteria_overrides,
    'note', v_row.note,
    'actorUserId', v_row.actor_user_id,
    'createdAt', v_row.created_at
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_insert_grade_override(jsonb) FROM PUBLIC;
