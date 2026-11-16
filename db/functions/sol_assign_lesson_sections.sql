-- Live definition of sol_assign_lesson_sections() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_assign_lesson_sections(p_payload jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson uuid := (p_payload->>'lessonId')::uuid;
  v_assigned_by uuid := (p_payload->>'assignedBy')::uuid;
  v_tenant uuid;
  v_section uuid;
  v_sec_tenant uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM lessons
  WHERE id = v_lesson AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Lesson not found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  FOR v_section IN
    SELECT (jsonb_array_elements_text(COALESCE(p_payload->'sectionIds', '[]'::jsonb)))::uuid
  LOOP
    SELECT COALESCE(s.tenant_id, s.workspace_id) INTO v_sec_tenant
    FROM sections s WHERE s.id = v_section;
    IF v_sec_tenant IS NULL OR v_sec_tenant IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'Section tenant mismatch for lesson assignment';
    END IF;
    INSERT INTO lesson_sections (lesson_id, section_id, assigned_by, tenant_id)
    VALUES (v_lesson, v_section, v_assigned_by, v_tenant)
    ON CONFLICT DO NOTHING;
    v_ids := array_append(v_ids, v_section);
  END LOOP;

  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION sol_assign_lesson_sections(jsonb) FROM PUBLIC;
