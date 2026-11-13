-- Book RAG indexing writes course_materials / course_material_chunks under
-- FORCE RLS. Bare Drizzle inserts omit tenant_id + offering_id, so WITH CHECK
-- fails and Knowledge search never indexes the book.

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

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_insert_course_material_chunks(p_payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_material uuid := (p_payload->>'materialId')::uuid;
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_tenant uuid;
  v_chunk jsonb;
  v_count int := 0;
  v_embedding text;
BEGIN
  IF v_material IS NULL OR v_course IS NULL THEN
    RAISE EXCEPTION 'materialId and courseId required';
  END IF;

  SELECT COALESCE(m.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM course_materials m
  JOIN courses c ON c.id = m.course_id
  WHERE m.id = v_material;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Material not found';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  FOR v_chunk IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'chunks', '[]'::jsonb))
  LOOP
    v_embedding := v_chunk->>'embedding';
    INSERT INTO course_material_chunks (
      material_id,
      course_id,
      tenant_id,
      chunk_index,
      content,
      token_count,
      embedding
    ) VALUES (
      v_material,
      v_course,
      v_tenant,
      COALESCE((v_chunk->>'chunkIndex')::int, 0),
      COALESCE(v_chunk->>'content', ''),
      COALESCE((v_chunk->>'tokenCount')::int, 0),
      CASE
        WHEN v_embedding IS NULL OR v_embedding = '' THEN NULL
        ELSE v_embedding::vector
      END
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_soft_delete_course_materials(p_material_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mid uuid;
  v_tenant uuid;
  v_count int := 0;
BEGIN
  IF p_material_ids IS NULL OR array_length(p_material_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH v_mid IN ARRAY p_material_ids
  LOOP
    SELECT COALESCE(m.tenant_id, c.tenant_id, c.workspace_id)
    INTO v_tenant
    FROM course_materials m
    JOIN courses c ON c.id = m.course_id
    WHERE m.id = v_mid;
    IF v_tenant IS NOT NULL THEN
      PERFORM set_config('app.tenant_id', v_tenant::text, true);
    END IF;

    UPDATE course_materials
    SET deleted_at = now(), updated_at = now()
    WHERE id = v_mid AND deleted_at IS NULL;
    IF FOUND THEN v_count := v_count + 1; END IF;

    UPDATE course_material_chunks
    SET deleted_at = now()
    WHERE material_id = v_mid AND deleted_at IS NULL;
  END LOOP;

  RETURN v_count;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_set_book_chapters_material(
  p_book_id uuid,
  p_material_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_count int;
BEGIN
  IF p_book_id IS NULL THEN
    RAISE EXCEPTION 'bookId required';
  END IF;

  SELECT COALESCE(hb.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM hosted_books hb
  JOIN courses c ON c.id = hb.course_id
  WHERE hb.id = p_book_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Book not found';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE book_chapters
  SET material_id = p_material_id, updated_at = now()
  WHERE book_id = p_book_id AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

--> statement-breakpoint
-- Neon HTTP/WebSocket sessions often drop transaction GUCs; prefer DEFINER
-- reads over withTenant when loading chapter markdown for RAG indexing.
CREATE OR REPLACE FUNCTION sol_book_chapters_for_rag(p_book_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_book_id IS NULL THEN
    RAISE EXCEPTION 'bookId required';
  END IF;

  SELECT COALESCE(hb.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM hosted_books hb
  JOIN courses c ON c.id = hb.course_id
  WHERE hb.id = p_book_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Book not found';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', bc.id,
          'title', bc.title,
          'partTitle', bc.part_title,
          'markdown', bc.markdown,
          'materialId', bc.material_id,
          'position', bc.position
        )
        ORDER BY bc.position ASC
      )
      FROM book_chapters bc
      WHERE bc.book_id = p_book_id AND bc.deleted_at IS NULL
    ),
    '[]'::jsonb
  );
END;
$$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_create_course_material(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION sol_insert_course_material_chunks(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION sol_soft_delete_course_materials(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION sol_set_book_chapters_material(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION sol_book_chapters_for_rag(uuid) FROM PUBLIC;

--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_create_course_material(jsonb) TO sol_app;
    GRANT EXECUTE ON FUNCTION sol_insert_course_material_chunks(jsonb) TO sol_app;
    GRANT EXECUTE ON FUNCTION sol_soft_delete_course_materials(uuid[]) TO sol_app;
    GRANT EXECUTE ON FUNCTION sol_set_book_chapters_material(uuid, uuid) TO sol_app;
    GRANT EXECUTE ON FUNCTION sol_book_chapters_for_rag(uuid) TO sol_app;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_create_course_material(jsonb) OWNER TO neondb_owner;
    ALTER FUNCTION sol_insert_course_material_chunks(jsonb) OWNER TO neondb_owner;
    ALTER FUNCTION sol_soft_delete_course_materials(uuid[]) OWNER TO neondb_owner;
    ALTER FUNCTION sol_set_book_chapters_material(uuid, uuid) OWNER TO neondb_owner;
    ALTER FUNCTION sol_book_chapters_for_rag(uuid) OWNER TO neondb_owner;
  END IF;
END
$$;
