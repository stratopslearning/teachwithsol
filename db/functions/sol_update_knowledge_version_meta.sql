-- Live definition of sol_update_knowledge_version_meta() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_update_knowledge_version_meta(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version uuid := (p_payload->>'versionId')::uuid;
  v_tenant uuid;
BEGIN
  SELECT COALESCE(v.tenant_id, d.tenant_id, d.workspace_id)
  INTO v_tenant
  FROM knowledge_document_versions v
  JOIN knowledge_documents d ON d.id = v.document_id
  WHERE v.id = v_version;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  UPDATE knowledge_document_versions SET
    ocr_used = COALESCE((p_payload->>'ocrUsed')::boolean, ocr_used),
    char_count = COALESCE((p_payload->>'charCount')::int, char_count),
    checksum = COALESCE(NULLIF(p_payload->>'checksum', ''), checksum)
  WHERE id = v_version;
END;
$$;
REVOKE ALL ON FUNCTION sol_update_knowledge_version_meta(jsonb) FROM PUBLIC;
