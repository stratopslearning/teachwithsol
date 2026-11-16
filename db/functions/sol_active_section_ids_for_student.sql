-- Live definition of sol_active_section_ids_for_student() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_active_section_ids_for_student(p_student_id uuid)
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
  SELECT COALESCE(array_agg(ss.section_id), ARRAY[]::uuid[])
  INTO v_ids
  FROM student_sections ss
  WHERE ss.student_id = p_student_id AND ss.status = 'ACTIVE';
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION sol_active_section_ids_for_student(uuid) FROM PUBLIC;
