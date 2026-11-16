-- Live definition of sol_add_knowledge_document_version() (last changed in drizzle/0064_knowledge_quiz_update_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_add_knowledge_document_version(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc uuid := (p_payload->>'documentId')::uuid;
  v_tenant uuid;
  v_user uuid := NULLIF(p_payload->>'createdByUserId', '')::uuid;
  v_ver uuid;
  v_num int := COALESCE((p_payload->>'version')::int, 1);
BEGIN
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'documentId required';
  END IF;

  SELECT COALESCE(tenant_id, workspace_id) INTO v_tenant
  FROM knowledge_documents
  WHERE id = v_doc AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found: %', v_doc;
  END IF;

  INSERT INTO knowledge_document_versions (
    document_id,
    tenant_id,
    version,
    s3_key,
    checksum,
    byte_size,
    mime_type,
    created_by_user_id
  ) VALUES (
    v_doc,
    v_tenant,
    v_num,
    NULLIF(p_payload->>'s3Key', ''),
    NULLIF(p_payload->>'checksum', ''),
    NULLIF(p_payload->>'byteSize', '')::int,
    NULLIF(p_payload->>'mimeType', ''),
    v_user
  )
  RETURNING id INTO v_ver;

  UPDATE knowledge_documents
  SET
    current_version_id = v_ver,
    mime_type = COALESCE(NULLIF(p_payload->>'mimeType', ''), mime_type),
    byte_size = COALESCE(NULLIF(p_payload->>'byteSize', '')::int, byte_size),
    status = 'PENDING',
    error_message = NULL,
    updated_at = now()
  WHERE id = v_doc;

  RETURN v_ver;
END;
$$;
REVOKE ALL ON FUNCTION sol_add_knowledge_document_version(jsonb) FROM PUBLIC;
