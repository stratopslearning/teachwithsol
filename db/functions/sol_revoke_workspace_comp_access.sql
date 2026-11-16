-- Live definition of sol_revoke_workspace_comp_access() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_revoke_workspace_comp_access(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_license workspace_licenses%ROWTYPE;
  v_revoked timestamptz := now();
BEGIN
  PERFORM set_config('app.tenant_id', p_workspace_id::text, true);

  SELECT * INTO v_license
  FROM workspace_licenses
  WHERE workspace_id = p_workspace_id
  ORDER BY created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace has no license row';
  END IF;

  IF v_license.status = 'active'
     AND v_license.stripe_subscription_id IS NOT NULL
     AND v_license.billing_provider = 'stripe' THEN
    RAISE EXCEPTION 'STRIPE_ACTIVE_SUBSCRIPTION';
  END IF;

  UPDATE workspace_licenses SET
    status = 'canceled',
    period_end = v_revoked,
    updated_at = v_revoked
  WHERE id = v_license.id;

  UPDATE workspaces SET status = 'suspended', updated_at = v_revoked
  WHERE id = p_workspace_id;

  RETURN jsonb_build_object('revokedAt', v_revoked);
END;
$$;
REVOKE ALL ON FUNCTION sol_revoke_workspace_comp_access(uuid) FROM PUBLIC;
