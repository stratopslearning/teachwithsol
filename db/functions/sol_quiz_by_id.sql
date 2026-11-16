-- Live definition of sol_quiz_by_id() (last changed in drizzle/0052_entity_resolve_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_quiz_by_id(p_quiz_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  professor_id uuid,
  tenant_id uuid,
  offering_id uuid,
  end_date timestamptz,
  description text,
  deleted_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    q.id, q.title, q.professor_id, q.tenant_id, q.offering_id,
    q.end_date, q.description, q.deleted_at
  FROM quizzes q
  WHERE q.id = p_quiz_id AND q.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_quiz_by_id(uuid) FROM PUBLIC;
