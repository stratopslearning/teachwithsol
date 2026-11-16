-- Live definition of sol_set_course_knowledge_corpus() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_course_knowledge_corpus(p_payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_document uuid := (p_payload->>'documentId')::uuid;
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
  v_corpus text := p_payload->>'authoringCorpus';
  v_count integer;
BEGIN
  IF v_course IS NULL OR v_document IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'courseId, documentId, tenantId required';
  END IF;
  IF v_corpus IS NULL OR v_corpus NOT IN ('prior_course', 'this_term') THEN
    RAISE EXCEPTION 'invalid authoringCorpus';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  UPDATE course_knowledge_links
  SET authoring_corpus = v_corpus, updated_at = now()
  WHERE course_id = v_course AND document_id = v_document;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION sol_set_course_knowledge_corpus(jsonb) FROM PUBLIC;
