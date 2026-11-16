-- Live definition of sol_dismiss_course_knowledge_update() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_dismiss_course_knowledge_update(p_payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_document uuid := (p_payload->>'documentId')::uuid;
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
  v_count integer;
BEGIN
  IF v_course IS NULL OR v_document IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'courseId, documentId, tenantId required';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  UPDATE course_knowledge_links SET
    update_available_version_id = NULL,
    update_noticed_at = NULL,
    updated_at = now()
  WHERE course_id = v_course
    AND document_id = v_document
    AND update_available_version_id IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION sol_dismiss_course_knowledge_update(jsonb) FROM PUBLIC;
