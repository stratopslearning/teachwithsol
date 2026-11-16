-- Live definition of sol_list_knowledge_connectors() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_knowledge_connectors(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_workspace_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  PERFORM set_config('app.tenant_id', p_workspace_id::text, true);
  RETURN COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(kc) ORDER BY kc.updated_at DESC)
      FROM knowledge_connectors kc
      WHERE kc.workspace_id = p_workspace_id AND kc.deleted_at IS NULL
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_list_knowledge_connectors(uuid) FROM PUBLIC;
