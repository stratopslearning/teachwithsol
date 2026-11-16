-- Live definition of sol_ensure_offering() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_ensure_offering(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
  v_term text := COALESCE(NULLIF(trim(p_payload->>'termLabel'), ''), 'default');
  v_status text := COALESCE(NULLIF(p_payload->>'status', ''), 'active');
  v_starts timestamptz := NULLIF(p_payload->>'startsAt', '')::timestamptz;
  v_ends timestamptz := NULLIF(p_payload->>'endsAt', '')::timestamptz;
  v_course_tenant uuid;
  v_row course_offerings%ROWTYPE;
BEGIN
  IF v_course IS NULL THEN
    RAISE EXCEPTION 'courseId required';
  END IF;

  SELECT COALESCE(c.tenant_id, c.workspace_id) INTO v_course_tenant
  FROM courses c
  WHERE c.id = v_course AND c.deleted_at IS NULL;
  IF v_course_tenant IS NULL THEN
    RAISE EXCEPTION 'Course not found: %', v_course;
  END IF;

  IF v_tenant IS NOT NULL AND v_tenant IS DISTINCT FROM v_course_tenant THEN
    RAISE EXCEPTION 'tenantId does not match course';
  END IF;
  v_tenant := v_course_tenant;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  SELECT * INTO v_row
  FROM course_offerings o
  WHERE o.course_id = v_course AND o.term_label = v_term
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_row.id,
      'courseId', v_row.course_id,
      'tenantId', v_row.tenant_id,
      'termLabel', v_row.term_label,
      'status', v_row.status,
      'startsAt', v_row.starts_at,
      'endsAt', v_row.ends_at
    );
  END IF;

  INSERT INTO course_offerings (
    course_id, tenant_id, term_label, status, starts_at, ends_at
  ) VALUES (
    v_course, v_tenant, v_term, v_status, v_starts, v_ends
  )
  ON CONFLICT (course_id, term_label) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM course_offerings o
    WHERE o.course_id = v_course AND o.term_label = v_term
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Failed to ensure offering';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'courseId', v_row.course_id,
    'tenantId', v_row.tenant_id,
    'termLabel', v_row.term_label,
    'status', v_row.status,
    'startsAt', v_row.starts_at,
    'endsAt', v_row.ends_at
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_ensure_offering(jsonb) FROM PUBLIC;
