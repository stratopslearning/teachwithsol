-- Live definition of sol_list_open_attempt_ids() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_open_attempt_ids(p_limit integer DEFAULT 120)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id ORDER BY started_at ASC), ARRAY[]::uuid[])
  INTO v_ids
  FROM (
    SELECT a.id, a.started_at
    FROM attempts a
    WHERE a.submitted_at IS NULL
    ORDER BY a.started_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 120), 1)
  ) x;
  RETURN v_ids;
END;
$$;
