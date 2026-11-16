-- Live definition of append_audit() (last changed in drizzle/0042_tenantize_remaining.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION append_audit(
  p_actor_user_id uuid,
  p_actor_clerk_id text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb,
  p_tenant_id uuid,
  p_ip text,
  p_user_agent text,
  p_platform boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF p_tenant_id IS NULL AND NOT COALESCE(p_platform, false) THEN
    RAISE EXCEPTION 'append_audit: tenant_id required unless platform event';
  END IF;
  IF COALESCE(p_platform, false) THEN
    PERFORM set_config('app.audit_platform', '1', true);
  ELSE
    PERFORM set_config('app.audit_platform', '0', true);
    IF p_tenant_id IS NOT NULL THEN
      PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
    END IF;
  END IF;

  INSERT INTO audit_log (
    actor_user_id, actor_clerk_id, action, target_type, target_id,
    metadata, tenant_id, ip, user_agent
  ) VALUES (
    p_actor_user_id, p_actor_clerk_id, p_action, p_target_type, p_target_id,
    p_metadata, p_tenant_id, p_ip, p_user_agent
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION append_audit(uuid, text, text, text, text, jsonb, uuid, text, text, boolean) TO sol_app;
