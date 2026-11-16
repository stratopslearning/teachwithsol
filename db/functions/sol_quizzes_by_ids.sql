-- Live definition of sol_quizzes_by_ids() (last changed in drizzle/0053_faculty_student_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_quizzes_by_ids(p_quiz_ids uuid[])
RETURNS TABLE (
  id uuid,
  title text,
  is_active boolean,
  professor_id uuid,
  tenant_id uuid,
  offering_id uuid,
  end_date timestamptz,
  description text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT q.id, q.title, q.is_active, q.professor_id, q.tenant_id, q.offering_id,
         q.end_date, q.description
  FROM quizzes q
  WHERE q.id = ANY (p_quiz_ids) AND q.deleted_at IS NULL;
$$;
