-- Live definition of sol_create_connector_knowledge_document() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_connector_knowledge_document(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
  v_user uuid := NULLIF(p_payload->>'createdByUserId', '')::uuid;
  v_id uuid := COALESCE(NULLIF(p_payload->>'id', '')::uuid, gen_random_uuid());
  v_row knowledge_documents%ROWTYPE;
BEGIN
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'workspaceId required';
  END IF;
  PERFORM set_config('app.tenant_id', v_workspace::text, true);

  INSERT INTO knowledge_documents (
    id, workspace_id, tenant_id, title, source_kind, mime_type, byte_size,
    connector_id, external_id, external_path, status, visibility, created_by_user_id
  ) VALUES (
    v_id,
    v_workspace,
    v_workspace,
    COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled'),
    COALESCE(p_payload->>'sourceKind', 'CONNECTOR'),
    NULLIF(p_payload->>'mimeType', ''),
    NULLIF(p_payload->>'byteSize', '')::int,
    NULLIF(p_payload->>'connectorId', '')::uuid,
    NULLIF(p_payload->>'externalId', ''),
    NULLIF(p_payload->>'externalPath', ''),
    COALESCE(p_payload->>'status', 'PENDING'),
    COALESCE(p_payload->>'visibility', 'workspace'),
    v_user
  )
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_create_connector_knowledge_document(jsonb) FROM PUBLIC;
