-- Live definition of sol_active_workspace_license() (last changed in drizzle/0099_active_workspace_license_definer.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_active_workspace_license(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row workspace_licenses%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('app.tenant_id', p_workspace_id::text, true);

  SELECT * INTO v_row
  FROM workspace_licenses
  WHERE workspace_id = p_workspace_id
    AND status IN ('active', 'trialing')
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_active_workspace_license(uuid) FROM PUBLIC;
