-- Live definition of sol_create_course_material() (last changed in drizzle/0092_book_rag_material_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_course_material(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_user uuid := (p_payload->>'uploadedByUserId')::uuid;
  v_title text := COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled');
  v_source text := COALESCE(NULLIF(p_payload->>'sourceType', ''), 'UPLOAD');
  v_mime text := NULLIF(p_payload->>'mimeType', '');
  v_bytes int := NULLIF(p_payload->>'byteSize', '')::int;
  v_status text := COALESCE(NULLIF(p_payload->>'status', ''), 'PROCESSING');
  v_tenant uuid;
  v_offering uuid;
  v_row course_materials%ROWTYPE;
BEGIN
  IF v_course IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'courseId and uploadedByUserId required';
  END IF;
  IF v_source NOT IN ('UPLOAD', 'URL') THEN
    RAISE EXCEPTION 'invalid sourceType';
  END IF;
  IF v_status NOT IN ('PENDING', 'PROCESSING', 'READY', 'FAILED') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  SELECT COALESCE(c.tenant_id, c.workspace_id) INTO v_tenant
  FROM sol_course_by_id(v_course) c;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  SELECT o.id INTO v_offering
  FROM course_offerings o
  WHERE o.course_id = v_course AND o.term_label = 'default'
  LIMIT 1;
  IF v_offering IS NULL THEN
    SELECT o.id INTO v_offering
    FROM course_offerings o
    WHERE o.course_id = v_course
    ORDER BY o.created_at ASC
    LIMIT 1;
  END IF;
  IF v_offering IS NULL THEN
    RAISE EXCEPTION 'Course has no offering';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  INSERT INTO course_materials (
    course_id,
    tenant_id,
    offering_id,
    uploaded_by_user_id,
    title,
    source_type,
    mime_type,
    byte_size,
    status
  ) VALUES (
    v_course,
    v_tenant,
    v_offering,
    v_user,
    left(v_title, 500),
    v_source,
    v_mime,
    v_bytes,
    v_status
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_create_course_material(jsonb) FROM PUBLIC;
