-- Live definition of sol_set_quiz_sections() (last changed in drizzle/0076_invite_claim_definer_hardening.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_quiz_sections(p_payload jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz uuid := (p_payload->>'quizId')::uuid;
  v_assigned_by uuid := (p_payload->>'assignedBy')::uuid;
  v_tenant uuid;
  v_ids uuid[];
  v_bad int;
BEGIN
  SELECT tenant_id INTO v_tenant FROM quizzes WHERE id = v_quiz AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Quiz not found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  SELECT count(*)::int INTO v_bad
  FROM unnest(
    COALESCE(
      ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(p_payload->'sectionIds', '[]'::jsonb)
        )::uuid
      ),
      ARRAY[]::uuid[]
    )
  ) AS sid
  LEFT JOIN sections s ON s.id = sid
  WHERE s.id IS NULL
     OR COALESCE(s.tenant_id, s.workspace_id) IS DISTINCT FROM v_tenant;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Section tenant mismatch for quiz assignment';
  END IF;

  DELETE FROM quiz_sections WHERE quiz_id = v_quiz;

  INSERT INTO quiz_sections (quiz_id, section_id, assigned_by, tenant_id)
  SELECT v_quiz, sid, v_assigned_by, v_tenant
  FROM unnest(
    COALESCE(
      ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(p_payload->'sectionIds', '[]'::jsonb)
        )::uuid
      ),
      ARRAY[]::uuid[]
    )
  ) AS sid;

  SELECT array_agg(section_id) INTO v_ids
  FROM quiz_sections WHERE quiz_id = v_quiz;
  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END;
$$;
