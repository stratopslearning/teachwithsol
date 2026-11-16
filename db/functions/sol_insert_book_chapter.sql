-- Live definition of sol_insert_book_chapter() (last changed in drizzle/0091_hosted_books_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_insert_book_chapter(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book uuid := (p_payload->>'bookId')::uuid;
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_tenant uuid;
  v_id uuid;
BEGIN
  IF v_book IS NULL OR v_course IS NULL THEN
    RAISE EXCEPTION 'bookId and courseId required';
  END IF;

  SELECT COALESCE(hb.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM hosted_books hb
  JOIN courses c ON c.id = hb.course_id
  WHERE hb.id = v_book;
  IF NOT FOUND OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'Book not found';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  INSERT INTO book_chapters (
    book_id,
    course_id,
    tenant_id,
    parent_id,
    level,
    position,
    title,
    slug,
    part_title,
    markdown,
    html,
    source_url,
    material_id
  ) VALUES (
    v_book,
    v_course,
    v_tenant,
    NULLIF(p_payload->>'parentId', '')::uuid,
    COALESCE((p_payload->>'level')::int, 1),
    COALESCE((p_payload->>'position')::int, 0),
    left(COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Chapter'), 300),
    left(COALESCE(NULLIF(trim(p_payload->>'slug'), ''), 'chapter'), 120),
    NULLIF(left(trim(p_payload->>'partTitle'), 300), ''),
    COALESCE(p_payload->>'markdown', ''),
    NULLIF(p_payload->>'html', ''),
    NULLIF(p_payload->>'sourceUrl', ''),
    NULLIF(p_payload->>'materialId', '')::uuid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_insert_book_chapter(jsonb) FROM PUBLIC;
