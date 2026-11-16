-- Live definition of sol_student_quiz_due_for_sections() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_student_quiz_due_for_sections(p_section_ids uuid[])
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
      SELECT jsonb_agg(row_to_json(x)::jsonb)
      FROM (
        SELECT
          q.id AS "quizId",
          q.title,
          q.start_date AS "startDate",
          q.end_date AS "endDate",
          q.is_active AS "isActive",
          qs.section_id AS "sectionId",
          s.name AS "sectionName",
          c.title AS "courseTitle"
        FROM quiz_sections qs
        JOIN quizzes q ON q.id = qs.quiz_id
        JOIN sections s ON s.id = qs.section_id
        JOIN courses c ON c.id = s.course_id
        WHERE qs.section_id = ANY(p_section_ids)
          AND q.deleted_at IS NULL
          AND q.is_active = true
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_student_quiz_due_for_sections(uuid[]) FROM PUBLIC;
