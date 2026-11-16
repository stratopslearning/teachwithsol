-- Live definition of sol_link_course_knowledge() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_link_course_knowledge(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_document uuid := (p_payload->>'documentId')::uuid;
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
  v_user uuid := NULLIF(p_payload->>'linkedByUserId', '')::uuid;
  v_corpus text := COALESCE(NULLIF(p_payload->>'authoringCorpus', ''), 'this_term');
  v_pinned uuid := NULLIF(p_payload->>'pinnedVersionId', '')::uuid;
  v_doc knowledge_documents%ROWTYPE;
BEGIN
  IF v_course IS NULL OR v_document IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'courseId, documentId, tenantId required';
  END IF;
  IF v_corpus NOT IN ('prior_course', 'this_term') THEN
    RAISE EXCEPTION 'invalid authoringCorpus';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  SELECT * INTO v_doc
  FROM knowledge_documents
  WHERE id = v_document
    AND workspace_id = v_tenant
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found in workspace library';
  END IF;
  IF v_doc.visibility = 'personal' THEN
    RAISE EXCEPTION 'Share this document to the library before attaching it to a course';
  END IF;
  v_pinned := COALESCE(v_pinned, v_doc.current_version_id);
  IF v_pinned IS NULL THEN
    RAISE EXCEPTION 'Document has no indexed version yet';
  END IF;

  INSERT INTO course_knowledge_links (
    course_id, document_id, tenant_id, linked_by_user_id,
    authoring_corpus, pinned_version_id, updated_at
  ) VALUES (
    v_course, v_document, v_tenant, v_user, v_corpus, v_pinned, now()
  )
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION sol_link_course_knowledge(jsonb) FROM PUBLIC;
