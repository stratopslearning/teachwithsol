-- Live definition of sol_workspace_active_learner_count() (last changed in drizzle/0051_workspace_courses_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_workspace_active_learner_count(p_workspace_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT count(DISTINCT ss.student_id)::int
      FROM student_sections ss
      JOIN sections s ON s.id = ss.section_id
      JOIN courses c ON c.id = s.course_id
      WHERE c.workspace_id = p_workspace_id
        AND ss.status = 'ACTIVE'
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND c.deleted_at IS NULL
    ),
    0
  );
$$;
REVOKE ALL ON FUNCTION sol_workspace_active_learner_count(uuid) FROM PUBLIC;
