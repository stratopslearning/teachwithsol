-- Live definition of sol_create_knowledge_document() (last changed in drizzle/0064_knowledge_quiz_update_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_knowledge_document(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
  v_user uuid := NULLIF(p_payload->>'createdByUserId', '')::uuid;
  v_doc uuid;
BEGIN
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'workspaceId required';
  END IF;

  INSERT INTO knowledge_documents (
    workspace_id,
    tenant_id,
    title,
    source_kind,
    mime_type,
    byte_size,
    external_url,
    status,
    visibility,
    created_by_user_id
  ) VALUES (
    v_workspace,
    v_workspace,
    COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled'),
    COALESCE(p_payload->>'sourceKind', 'UPLOAD'),
    NULLIF(p_payload->>'mimeType', ''),
    NULLIF(p_payload->>'byteSize', '')::int,
    NULLIF(p_payload->>'externalUrl', ''),
    'PENDING',
    COALESCE(p_payload->>'visibility', 'personal'),
    v_user
  )
  RETURNING id INTO v_doc;

  RETURN v_doc;
END;
$$;
REVOKE ALL ON FUNCTION sol_create_knowledge_document(jsonb) FROM PUBLIC;
