-- Live definition of sol_assign_book_sections() (last changed in drizzle/0095_faculty_book_reader_release.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_assign_book_sections(p_payload jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book uuid := (p_payload->>'bookId')::uuid;
  v_assigned_by uuid := (p_payload->>'assignedBy')::uuid;
  v_tenant uuid;
  v_section uuid;
  v_offering uuid;
  v_sec_tenant uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_book IS NULL OR v_assigned_by IS NULL THEN
    RAISE EXCEPTION 'bookId and assignedBy required';
  END IF;

  SELECT COALESCE(hb.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM hosted_books hb
  JOIN courses c ON c.id = hb.course_id
  WHERE hb.id = v_book AND hb.deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Book not found';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  DELETE FROM book_sections WHERE book_id = v_book;

  FOR v_section IN
    SELECT (jsonb_array_elements_text(COALESCE(p_payload->'sectionIds', '[]'::jsonb)))::uuid
  LOOP
    SELECT s.offering_id, s.tenant_id
    INTO v_offering, v_sec_tenant
    FROM sections s
    WHERE s.id = v_section AND s.deleted_at IS NULL;
    IF v_offering IS NULL THEN
      RAISE EXCEPTION 'Section % missing offering_id', v_section;
    END IF;

    INSERT INTO book_sections (
      book_id, section_id, assigned_by, tenant_id, offering_id
    ) VALUES (
      v_book,
      v_section,
      v_assigned_by,
      COALESCE(v_sec_tenant, v_tenant),
      v_offering
    );
    v_ids := array_append(v_ids, v_section);
  END LOOP;

  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION sol_assign_book_sections(jsonb) FROM PUBLIC;
