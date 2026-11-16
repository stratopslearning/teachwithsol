-- Live definition of sol_create_hosted_book() (last changed in drizzle/0091_hosted_books_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_hosted_book(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_user uuid := (p_payload->>'createdByUserId')::uuid;
  v_title text := COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Imported book');
  v_kind text := p_payload->>'sourceKind';
  v_url text := NULLIF(p_payload->>'sourceUrl', '');
  v_s3 text := NULLIF(p_payload->>'s3Key', '');
  v_tenant uuid;
  v_row hosted_books%ROWTYPE;
BEGIN
  IF v_course IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'courseId and createdByUserId required';
  END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('WEBBOOK_URL', 'EPUB', 'PRESSBOOKS_XML', 'PDF') THEN
    RAISE EXCEPTION 'invalid sourceKind';
  END IF;

  -- Resolve via bypass DEFINER so this works even when the function owner
  -- does not have BYPASSRLS (sol_migrator) and app.tenant_id is unset.
  SELECT COALESCE(c.tenant_id, c.workspace_id) INTO v_tenant
  FROM sol_course_by_id(v_course) c;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  INSERT INTO hosted_books (
    course_id,
    tenant_id,
    created_by_user_id,
    title,
    source_kind,
    source_url,
    s3_key,
    status
  ) VALUES (
    v_course,
    v_tenant,
    v_user,
    left(v_title, 500),
    v_kind,
    v_url,
    v_s3,
    'PENDING'
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_create_hosted_book(jsonb) FROM PUBLIC;
