-- Live definition of sol_grant_workspace_comp_access() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_grant_workspace_comp_access(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
  v_indefinite boolean := COALESCE((p_payload->>'indefinite')::boolean, false);
  v_days integer := COALESCE((p_payload->>'days')::integer, 30);
  v_start timestamptz := now();
  v_end timestamptz;
  v_license uuid;
BEGIN
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'workspaceId required'; END IF;
  PERFORM set_config('app.tenant_id', v_workspace::text, true);

  SELECT id INTO v_license
  FROM workspace_licenses
  WHERE workspace_id = v_workspace
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_license IS NULL THEN
    RAISE EXCEPTION 'Workspace has no license row';
  END IF;

  IF v_indefinite THEN
    v_end := NULL;
  ELSE
    v_days := GREATEST(1, LEAST(v_days, 365));
    v_end := v_start + make_interval(days => v_days);
  END IF;

  UPDATE workspace_licenses SET
    status = 'trialing',
    period_start = v_start,
    period_end = v_end,
    updated_at = v_start
  WHERE id = v_license;

  UPDATE workspaces SET status = 'trial', updated_at = v_start
  WHERE id = v_workspace;

  RETURN jsonb_build_object(
    'periodStart', v_start,
    'periodEnd', v_end
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_grant_workspace_comp_access(jsonb) FROM PUBLIC;
