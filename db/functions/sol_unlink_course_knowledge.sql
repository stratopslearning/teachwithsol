-- Live definition of sol_unlink_course_knowledge() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_unlink_course_knowledge(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_document uuid := (p_payload->>'documentId')::uuid;
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
BEGIN
  IF v_course IS NULL OR v_document IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'courseId, documentId, tenantId required';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  DELETE FROM course_knowledge_links
  WHERE course_id = v_course AND document_id = v_document;
END;
$$;
REVOKE ALL ON FUNCTION sol_unlink_course_knowledge(jsonb) FROM PUBLIC;
