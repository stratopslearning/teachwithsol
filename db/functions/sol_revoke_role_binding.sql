-- Live definition of sol_revoke_role_binding() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_revoke_role_binding(p_binding_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_role text;
  v_scope_type text;
  v_revoked timestamptz;
  v_owners int;
BEGIN
  SELECT tenant_id, role::text, scope_type::text, revoked_at
  INTO v_tenant, v_role, v_scope_type, v_revoked
  FROM role_bindings
  WHERE id = p_binding_id;

  IF NOT FOUND OR v_revoked IS NOT NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  IF v_role = 'owner' AND v_scope_type = 'organization' THEN
    SELECT count(*)::int INTO v_owners
    FROM role_bindings
    WHERE tenant_id = v_tenant
      AND scope_type = 'organization'
      AND scope_id = v_tenant
      AND role = 'owner'
      AND revoked_at IS NULL;
    IF v_owners <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last workspace owner';
    END IF;
  END IF;

  UPDATE role_bindings
  SET revoked_at = now()
  WHERE id = p_binding_id AND revoked_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION sol_revoke_role_binding(uuid) FROM PUBLIC;
