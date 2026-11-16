-- Live definition of sol_upsert_role_binding() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_role_binding(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
  v_user uuid := (p_payload->>'userId')::uuid;
  v_scope_type text := p_payload->>'scopeType';
  v_scope_id uuid := (p_payload->>'scopeId')::uuid;
  v_role text := p_payload->>'role';
  v_granted_by uuid := NULLIF(p_payload->>'grantedBy', '')::uuid;
  v_id uuid;
  v_revoked timestamptz;
BEGIN
  IF v_tenant IS NULL OR v_user IS NULL OR v_scope_type IS NULL
     OR v_scope_id IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'tenantId, userId, scopeType, scopeId, role required';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  SELECT b.id, b.revoked_at INTO v_id, v_revoked
  FROM role_bindings b
  WHERE b.tenant_id = v_tenant
    AND b.user_id = v_user
    AND b.scope_type = v_scope_type
    AND b.scope_id = v_scope_id
    AND b.role = v_role
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    IF v_revoked IS NOT NULL THEN
      UPDATE role_bindings
      SET revoked_at = NULL,
          granted_by = COALESCE(v_granted_by, granted_by)
      WHERE id = v_id;
    END IF;
    RETURN jsonb_build_object('bindingId', v_id, 'created', false);
  END IF;

  INSERT INTO role_bindings (
    tenant_id, user_id, scope_type, scope_id, role, granted_by
  ) VALUES (
    v_tenant, v_user, v_scope_type, v_scope_id, v_role, v_granted_by
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('bindingId', v_id, 'created', true);
END;
$$;
REVOKE ALL ON FUNCTION sol_upsert_role_binding(jsonb) FROM PUBLIC;
