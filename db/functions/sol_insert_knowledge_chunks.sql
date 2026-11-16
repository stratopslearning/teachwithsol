-- Live definition of sol_insert_knowledge_chunks() (last changed in drizzle/0076_invite_claim_definer_hardening.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_insert_knowledge_chunks(p_payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document uuid := (p_payload->>'documentId')::uuid;
  v_version uuid := (p_payload->>'versionId')::uuid;
  v_workspace uuid;
  v_tenant uuid;
  v_chunk jsonb;
  v_count int := 0;
  v_embedding text;
BEGIN
  IF v_document IS NULL OR v_version IS NULL THEN
    RAISE EXCEPTION 'documentId and versionId required';
  END IF;

  SELECT COALESCE(d.tenant_id, d.workspace_id), d.workspace_id
  INTO v_tenant, v_workspace
  FROM knowledge_documents d
  WHERE d.id = v_document;

  IF v_tenant IS NULL OR v_workspace IS NULL THEN
    RAISE EXCEPTION 'Document not found or missing tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM knowledge_document_versions v
    WHERE v.id = v_version AND v.document_id = v_document
  ) THEN
    RAISE EXCEPTION 'Version does not belong to document';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  FOR v_chunk IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'chunks', '[]'::jsonb))
  LOOP
    v_embedding := v_chunk->>'embedding';
    INSERT INTO knowledge_chunks (
      document_id, version_id, workspace_id, tenant_id,
      chunk_index, content, token_count, embedding
    ) VALUES (
      v_document,
      v_version,
      v_workspace,
      v_tenant,
      COALESCE((v_chunk->>'chunkIndex')::int, (v_chunk->>'index')::int, 0),
      COALESCE(v_chunk->>'content', ''),
      COALESCE((v_chunk->>'tokenCount')::int, 0),
      CASE
        WHEN v_embedding IS NULL OR v_embedding = '' THEN NULL
        ELSE v_embedding::vector
      END
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
