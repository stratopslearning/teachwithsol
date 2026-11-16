-- Live definition of sol_accept_course_knowledge_update() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_accept_course_knowledge_update(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_document uuid := (p_payload->>'documentId')::uuid;
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
  v_link course_knowledge_links%ROWTYPE;
BEGIN
  IF v_course IS NULL OR v_document IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'courseId, documentId, tenantId required';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  SELECT * INTO v_link
  FROM course_knowledge_links
  WHERE course_id = v_course AND document_id = v_document;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document is not attached to this course';
  END IF;
  IF v_link.update_available_version_id IS NULL THEN
    RAISE EXCEPTION 'No update available for this attachment';
  END IF;
  UPDATE course_knowledge_links SET
    pinned_version_id = v_link.update_available_version_id,
    update_available_version_id = NULL,
    update_noticed_at = NULL,
    updated_at = now()
  WHERE id = v_link.id;
END;
$$;
REVOKE ALL ON FUNCTION sol_accept_course_knowledge_update(jsonb) FROM PUBLIC;
