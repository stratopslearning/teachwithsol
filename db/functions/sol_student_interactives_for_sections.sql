-- Live definition of sol_student_interactives_for_sections() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_student_interactives_for_sections(p_section_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_section_ids IS NULL OR cardinality(p_section_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id', i.id,
        'title', i.title,
        'kind', i.kind,
        'courseId', i.course_id,
        'isActive', i.is_active
      ))
      FROM interactive_sections ins
      JOIN interactives i ON i.id = ins.interactive_id
      WHERE ins.section_id = ANY(p_section_ids)
        AND i.deleted_at IS NULL
        AND i.is_active = true
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_student_interactives_for_sections(uuid[]) FROM PUBLIC;
