-- Live definition of sol_fetch_access_request() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_fetch_access_request(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_id uuid := (p_payload->>'requestId')::uuid;
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
BEGIN
  PERFORM set_config('app.tenant_id', v_workspace::text, true);
  RETURN (
    SELECT to_jsonb(r.*)
    FROM workspace_access_requests r
    WHERE r.id = v_id AND r.workspace_id = v_workspace
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_fetch_access_request(jsonb) FROM PUBLIC;
