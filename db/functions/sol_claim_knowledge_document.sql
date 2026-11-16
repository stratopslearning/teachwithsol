-- Live definition of sol_claim_knowledge_document() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_claim_knowledge_document(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row knowledge_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM knowledge_documents WHERE id = p_document_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_row.tenant_id IS NOT NULL OR v_row.workspace_id IS NOT NULL THEN
    PERFORM set_config(
      'app.tenant_id',
      COALESCE(v_row.tenant_id, v_row.workspace_id)::text,
      true
    );
  END IF;

  UPDATE knowledge_documents
  SET status = 'PROCESSING', error_message = NULL, updated_at = now()
  WHERE id = p_document_id
    AND deleted_at IS NULL
    AND status = 'PENDING'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'workspaceId', v_row.workspace_id,
    'tenantId', v_row.tenant_id,
    'currentVersionId', v_row.current_version_id,
    'sourceKind', v_row.source_kind,
    'externalUrl', v_row.external_url,
    'mimeType', v_row.mime_type,
    'legacyMaterialId', v_row.legacy_material_id,
    'status', v_row.status
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_claim_knowledge_document(uuid) FROM PUBLIC;
