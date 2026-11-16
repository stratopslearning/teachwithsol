-- Live definition of sol_lessons_for_section_context() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_lessons_for_section_context(
  p_course_id uuid,
  p_section_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_course_id IS NULL OR p_section_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(c.tenant_id, c.workspace_id) INTO v_tenant
  FROM courses c WHERE c.id = p_course_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'title', l.title,
          'markdown', l.markdown,
          'updatedAt', l.updated_at
        )
        ORDER BY l.updated_at DESC
      )
      FROM lesson_sections ls
      JOIN lessons l ON l.id = ls.lesson_id
      WHERE ls.section_id = p_section_id
        AND l.course_id = p_course_id
        AND l.is_active = true
        AND l.deleted_at IS NULL
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_lessons_for_section_context(uuid, uuid) FROM PUBLIC;
