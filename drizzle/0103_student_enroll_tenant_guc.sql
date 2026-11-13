-- Student code enroll: sol_upsert_student_enrollment looked up the section
-- before app.tenant_id was set. Under FORCE RLS that hides the row →
-- "Section not found" (HTTP 500). Mirror 0090: accept optional tenantId hint
-- and set/clear GUC before the section read.

CREATE OR REPLACE FUNCTION sol_upsert_student_enrollment(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_section uuid := (p_payload->>'sectionId')::uuid;
  v_source text := NULLIF(trim(p_payload->>'source'), '');
  v_refuse_conflict boolean := COALESCE(
    (p_payload->>'refuseCourseConflict')::boolean,
    false
  );
  v_best_effort boolean := COALESCE(
    (p_payload->>'bestEffortOfferingSync')::boolean,
    false
  );
  v_hint uuid := NULLIF(p_payload->>'tenantId', '')::uuid;
  v_tenant uuid;
  v_offering uuid;
  v_course uuid;
  v_existing student_sections%ROWTYPE;
  v_has_existing boolean := false;
  v_sources jsonb;
  v_created boolean := false;
  v_reactivated boolean := false;
  v_enrollment_id uuid;
  v_conflict_id uuid;
  v_offering_existing student_offerings%ROWTYPE;
  v_has_offering boolean := false;
  v_offering_sources jsonb;
BEGIN
  IF v_student IS NULL OR v_section IS NULL THEN
    RAISE EXCEPTION 'studentId and sectionId required';
  END IF;
  IF v_source IS NULL OR v_source NOT IN ('lti', 'code', 'csv', 'invite') THEN
    RAISE EXCEPTION 'source must be lti|code|csv|invite';
  END IF;

  -- Prefer the destination tenant when the app already resolved it; otherwise
  -- clear the GUC so a stale caller tenant cannot hide the row.
  IF v_hint IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_hint::text, true);
  ELSE
    PERFORM set_config('app.tenant_id', '', true);
  END IF;
  PERFORM set_config('app.user_id', v_student::text, true);

  SELECT
    COALESCE(s.tenant_id, s.workspace_id),
    s.offering_id,
    s.course_id
  INTO v_tenant, v_offering, v_course
  FROM sections s
  WHERE s.id = v_section AND s.deleted_at IS NULL;

  IF v_course IS NULL THEN
    RAISE EXCEPTION 'Section not found';
  END IF;

  v_tenant := COALESCE(v_hint, v_tenant);
  v_offering := COALESCE(
    NULLIF(p_payload->>'offeringId', '')::uuid,
    v_offering
  );

  IF v_offering IS NULL THEN
    SELECT o.id INTO v_offering
    FROM course_offerings o
    WHERE o.course_id = v_course
    ORDER BY o.created_at ASC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Section tenant could not be resolved';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  SELECT * INTO v_existing
  FROM student_sections
  WHERE student_id = v_student AND section_id = v_section
  LIMIT 1;
  v_has_existing := FOUND;

  IF NOT v_has_existing AND v_refuse_conflict THEN
    SELECT ss.id INTO v_conflict_id
    FROM student_sections ss
    JOIN sections s ON s.id = ss.section_id
    WHERE ss.student_id = v_student
      AND ss.status = 'ACTIVE'
      AND s.course_id = v_course
      AND s.deleted_at IS NULL
      AND (
        s.ends_at IS NULL OR s.ends_at > now()
      )
    LIMIT 1;
    IF v_conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'COURSE_SECTION_CONFLICT'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_has_existing THEN
    v_reactivated := v_existing.status IS DISTINCT FROM 'ACTIVE';
    v_sources := COALESCE(v_existing.sources, '[]'::jsonb);
    IF NOT (v_sources @> jsonb_build_array(v_source)) THEN
      v_sources := v_sources || jsonb_build_array(v_source);
    END IF;
    UPDATE student_sections
    SET
      status = 'ACTIVE',
      sources = v_sources,
      tenant_id = COALESCE(v_tenant, tenant_id),
      offering_id = COALESCE(v_offering, offering_id)
    WHERE id = v_existing.id
    RETURNING id INTO v_enrollment_id;
  ELSE
    v_created := true;
    v_sources := jsonb_build_array(v_source);
    INSERT INTO student_sections (
      student_id, section_id, status, sources, tenant_id, offering_id
    ) VALUES (
      v_student, v_section, 'ACTIVE', v_sources, v_tenant, v_offering
    )
    RETURNING id INTO v_enrollment_id;
  END IF;

  -- Dual-write student_offerings (0046).
  IF v_offering IS NOT NULL THEN
    BEGIN
      SELECT * INTO v_offering_existing
      FROM student_offerings
      WHERE student_id = v_student AND offering_id = v_offering
      LIMIT 1;
      v_has_offering := FOUND;

      IF v_has_offering THEN
        v_offering_sources := COALESCE(v_offering_existing.sources, '[]'::jsonb);
        IF NOT (v_offering_sources @> jsonb_build_array(v_source)) THEN
          v_offering_sources := v_offering_sources || jsonb_build_array(v_source);
        END IF;
        UPDATE student_offerings
        SET
          status = 'ACTIVE',
          sources = v_offering_sources,
          updated_at = now()
        WHERE id = v_offering_existing.id;
      ELSE
        INSERT INTO student_offerings (
          tenant_id, student_id, offering_id, status, sources
        ) VALUES (
          v_tenant, v_student, v_offering, 'ACTIVE', jsonb_build_array(v_source)
        )
        ON CONFLICT DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      IF NOT v_best_effort THEN
        RAISE;
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object(
    'enrollmentId', v_enrollment_id,
    'created', v_created,
    'reactivated', v_reactivated,
    'sources', v_sources,
    'tenantId', v_tenant,
    'offeringId', v_offering
  );
END;
$$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_upsert_student_enrollment(jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_upsert_student_enrollment(jsonb) TO sol_app;
  END IF;
END
$$;
