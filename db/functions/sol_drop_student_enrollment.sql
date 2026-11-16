-- Live definition of sol_drop_student_enrollment() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_drop_student_enrollment(p_enrollment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row student_sections%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM student_sections WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;
  IF v_row.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_row.tenant_id::text, true);
  END IF;
  IF v_row.status = 'DROPPED' THEN
    RAISE EXCEPTION 'ALREADY_DROPPED';
  END IF;
  UPDATE student_sections SET status = 'DROPPED' WHERE id = p_enrollment_id;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'studentId', v_row.student_id,
    'sectionId', v_row.section_id,
    'offeringId', v_row.offering_id,
    'tenantId', v_row.tenant_id
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_drop_student_enrollment(uuid) FROM PUBLIC;
