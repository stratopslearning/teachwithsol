-- The student data export reads enrollments, attempts and chatbot sessions,
-- which are FORCE-RLS tables spread across every tenant the student belongs to.
-- With no tenant set, a plain read returns nothing, so the export came back
-- empty. This lists the student's tenants so the export can read each one
-- under withTenant.
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_student_tenant_ids(uuid) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_student_tenant_ids(uuid) TO sol_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_student_tenant_ids(uuid) OWNER TO neondb_owner;
  END IF;
END
$$;
