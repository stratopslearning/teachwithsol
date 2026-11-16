-- Live definition of sol_decide_access_request() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_decide_access_request(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := (p_payload->>'requestId')::uuid;
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
  v_status text := p_payload->>'status';
  v_actor uuid := (p_payload->>'decidedBy')::uuid;
  v_note text := NULLIF(trim(COALESCE(p_payload->>'note', '')), '');
BEGIN
  IF v_status IS NULL OR v_status NOT IN ('approved', 'rejected', 'blocked') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  PERFORM set_config('app.tenant_id', v_workspace::text, true);
  UPDATE workspace_access_requests SET
    status = v_status,
    decided_by = v_actor,
    decided_at = now(),
    note = v_note,
    updated_at = now()
  WHERE id = v_id AND workspace_id = v_workspace;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION sol_decide_access_request(jsonb) FROM PUBLIC;
