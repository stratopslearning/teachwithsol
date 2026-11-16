-- Live definition of sol_assign_quiz_sections() (last changed in drizzle/0076_invite_claim_definer_hardening.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_assign_quiz_sections(p_payload jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz uuid := (p_payload->>'quizId')::uuid;
  v_assigned_by uuid := (p_payload->>'assignedBy')::uuid;
  v_tenant uuid;
  v_section uuid;
  v_ids uuid[];
  v_sec_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM quizzes WHERE id = v_quiz AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Quiz not found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  FOR v_section IN
    SELECT (jsonb_array_elements_text(COALESCE(p_payload->'sectionIds', '[]'::jsonb)))::uuid
  LOOP
    SELECT COALESCE(s.tenant_id, s.workspace_id) INTO v_sec_tenant
    FROM sections s WHERE s.id = v_section;
    IF v_sec_tenant IS NULL OR v_sec_tenant IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'Section tenant mismatch for quiz assignment';
    END IF;
    INSERT INTO quiz_sections (quiz_id, section_id, assigned_by, tenant_id)
    VALUES (v_quiz, v_section, v_assigned_by, v_tenant)
    ON CONFLICT DO NOTHING;
  END LOOP;

  SELECT array_agg(section_id) INTO v_ids
  FROM quiz_sections WHERE quiz_id = v_quiz;
  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END;
$$;
