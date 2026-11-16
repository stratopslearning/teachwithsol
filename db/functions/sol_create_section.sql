-- Live definition of sol_create_section() (last changed in drizzle/0069_create_section_definer.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_section(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_user uuid := NULLIF(p_payload->>'createdByUserId', '')::uuid;
  v_name text := COALESCE(NULLIF(trim(p_payload->>'name'), ''), 'Section');
  v_prof_code text := NULLIF(trim(p_payload->>'professorEnrollmentCode'), '');
  v_student_code text := NULLIF(trim(p_payload->>'studentEnrollmentCode'), '');
  v_ends_at timestamptz := NULLIF(p_payload->>'endsAt', '')::timestamptz;
  v_bind boolean := COALESCE((p_payload->>'bindCreator')::boolean, true);
  v_workspace uuid;
  v_tenant uuid;
  v_offering uuid;
  v_section uuid;
  v_row sections%ROWTYPE;
BEGIN
  IF v_course IS NULL THEN
    RAISE EXCEPTION 'courseId required';
  END IF;
  IF v_prof_code IS NULL OR v_student_code IS NULL THEN
    RAISE EXCEPTION 'enrollment codes required';
  END IF;

  SELECT c.workspace_id, COALESCE(c.tenant_id, c.workspace_id)
  INTO v_workspace, v_tenant
  FROM courses c
  WHERE c.id = v_course AND c.deleted_at IS NULL;
  IF NOT FOUND OR v_workspace IS NULL THEN
    RAISE EXCEPTION 'Course not found: %', v_course;
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  SELECT o.id INTO v_offering
  FROM course_offerings o
  WHERE o.course_id = v_course AND o.term_label = 'default'
  LIMIT 1;

  IF v_offering IS NULL THEN
    INSERT INTO course_offerings (course_id, tenant_id, term_label, status)
    VALUES (v_course, v_tenant, 'default', 'active')
    ON CONFLICT (course_id, term_label) DO NOTHING
    RETURNING id INTO v_offering;

    IF v_offering IS NULL THEN
      SELECT o.id INTO v_offering
      FROM course_offerings o
      WHERE o.course_id = v_course AND o.term_label = 'default'
      LIMIT 1;
    END IF;
  END IF;

  IF v_offering IS NULL THEN
    RAISE EXCEPTION 'Failed to ensure default offering for course %', v_course;
  END IF;

  INSERT INTO sections (
    name,
    course_id,
    workspace_id,
    tenant_id,
    offering_id,
    professor_enrollment_code,
    student_enrollment_code,
    ends_at
  ) VALUES (
    left(v_name, 100),
    v_course,
    v_workspace,
    v_tenant,
    v_offering,
    v_prof_code,
    v_student_code,
    v_ends_at
  )
  RETURNING * INTO v_row;

  v_section := v_row.id;

  IF v_bind AND v_user IS NOT NULL THEN
    INSERT INTO professor_sections (
      professor_id, section_id, tenant_id, offering_id, status
    ) VALUES (
      v_user, v_section, v_tenant, v_offering, 'ACTIVE'
    )
    ON CONFLICT DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM role_bindings rb
      WHERE rb.tenant_id = v_tenant
        AND rb.user_id = v_user
        AND rb.scope_type = 'offering'
        AND rb.scope_id = v_offering
        AND rb.role = 'lead_instructor'
        AND rb.revoked_at IS NULL
    ) THEN
      INSERT INTO role_bindings (
        tenant_id, user_id, scope_type, scope_id, role, granted_by
      ) VALUES (
        v_tenant, v_user, 'offering', v_offering, 'lead_instructor', v_user
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'courseId', v_row.course_id,
    'workspaceId', v_row.workspace_id,
    'tenantId', v_row.tenant_id,
    'offeringId', v_row.offering_id,
    'professorEnrollmentCode', v_row.professor_enrollment_code,
    'studentEnrollmentCode', v_row.student_enrollment_code,
    'endsAt', v_row.ends_at,
    'createdAt', v_row.created_at
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_create_section(jsonb) FROM PUBLIC;
