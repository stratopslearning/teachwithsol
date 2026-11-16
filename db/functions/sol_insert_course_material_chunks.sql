-- Live definition of sol_insert_course_material_chunks() (last changed in drizzle/0092_book_rag_material_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

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
REVOKE ALL ON FUNCTION sol_insert_course_material_chunks(jsonb) FROM PUBLIC;
