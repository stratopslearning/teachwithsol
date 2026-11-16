-- Live definition of sol_apply_enrollment_source_removal() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_apply_enrollment_source_removal(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_section uuid := (p_payload->>'sectionId')::uuid;
  v_source text := p_payload->>'source';
  v_row student_sections%ROWTYPE;
  v_sources jsonb;
  v_next jsonb := '[]'::jsonb;
  v_elem text;
  v_offering uuid;
  v_still_active uuid;
BEGIN
  IF v_student IS NULL OR v_section IS NULL OR v_source IS NULL THEN
    RAISE EXCEPTION 'studentId, sectionId, source required';
  END IF;

  SELECT * INTO v_row
  FROM student_sections
  WHERE student_id = v_student AND section_id = v_section
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_row.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_row.tenant_id::text, true);
  END IF;

  FOR v_elem IN
    SELECT jsonb_array_elements_text(COALESCE(v_row.sources, '[]'::jsonb))
  LOOP
    IF v_elem IS DISTINCT FROM v_source THEN
      v_next := v_next || jsonb_build_array(v_elem);
    END IF;
  END LOOP;
  v_sources := v_next;

  IF jsonb_array_length(v_sources) = 0 THEN
    UPDATE student_sections
    SET status = 'DROPPED', sources = '[]'::jsonb
    WHERE id = v_row.id;
    v_offering := v_row.offering_id;
    IF v_offering IS NOT NULL THEN
      SELECT ss.id INTO v_still_active
      FROM student_sections ss
      WHERE ss.student_id = v_student
        AND ss.offering_id = v_offering
        AND ss.status = 'ACTIVE'
      LIMIT 1;
      IF v_still_active IS NULL THEN
        UPDATE student_offerings
        SET status = 'DROPPED', sources = '[]'::jsonb, updated_at = now()
        WHERE student_id = v_student AND offering_id = v_offering;
      END IF;
    END IF;
    RETURN 'dropped';
  END IF;

  UPDATE student_sections SET sources = v_sources WHERE id = v_row.id;
  RETURN 'active';
END;
$$;
REVOKE ALL ON FUNCTION sol_apply_enrollment_source_removal(jsonb) FROM PUBLIC;
