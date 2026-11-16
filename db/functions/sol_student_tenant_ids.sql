-- Live definition of sol_student_tenant_ids() (last changed in drizzle/0115_student_tenant_ids.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_student_tenant_ids(p_student_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF p_student_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  SELECT COALESCE(array_agg(DISTINCT t.tenant_id), ARRAY[]::uuid[])
  INTO v_ids
  FROM (
    SELECT ss.tenant_id FROM student_sections ss
      WHERE ss.student_id = p_student_id AND ss.tenant_id IS NOT NULL
    UNION
    SELECT a.tenant_id FROM attempts a
      WHERE a.student_id = p_student_id AND a.tenant_id IS NOT NULL
    UNION
    SELECT cs.tenant_id FROM chatbot_sessions cs
      WHERE cs.student_id = p_student_id AND cs.tenant_id IS NOT NULL
  ) t;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION sol_student_tenant_ids(uuid) FROM PUBLIC;
