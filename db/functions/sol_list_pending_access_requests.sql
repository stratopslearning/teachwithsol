-- Live definition of sol_list_pending_access_requests() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_pending_access_requests(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_workspace_id::text, true);
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at DESC)
    FROM (
      SELECT * FROM workspace_access_requests
      WHERE workspace_id = p_workspace_id AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 100
    ) r
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION sol_list_pending_access_requests(uuid) FROM PUBLIC;
