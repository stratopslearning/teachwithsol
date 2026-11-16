-- Live definition of sol_student_lessons_for_sections() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_student_lessons_for_sections(p_section_ids uuid[])
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
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.title, x."sectionName")
      FROM (
        SELECT
          l.id,
          l.title,
          c.title AS "courseTitle",
          s.name AS "sectionName",
          s.id AS "sectionId",
          (
            SELECT count(*)::int FROM flashcards f
            WHERE f.lesson_id = l.id AND f.deleted_at IS NULL
          ) AS "flashcardCount"
        FROM lesson_sections ls
        JOIN lessons l ON l.id = ls.lesson_id
        JOIN sections s ON s.id = ls.section_id
        JOIN courses c ON c.id = l.course_id
        WHERE ls.section_id = ANY(p_section_ids)
          AND l.deleted_at IS NULL
          AND l.is_active = true
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_student_lessons_for_sections(uuid[]) FROM PUBLIC;
