-- Live definition of sol_platform_audit_rows() (last changed in drizzle/0078_platform_audit_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_platform_audit_rows(
  p_action text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  action text,
  created_at timestamptz,
  actor_user_id uuid,
  actor_clerk_id text,
  target_type text,
  target_id text,
  tenant_id uuid,
  metadata jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    a.id,
    a.action,
    a.created_at,
    a.actor_user_id,
    a.actor_clerk_id,
    a.target_type,
    a.target_id,
    a.tenant_id,
    a.metadata
  FROM audit_log a
  WHERE (p_action IS NULL OR a.action = p_action)
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (p_from IS NULL OR a.created_at >= p_from)
    AND (p_to IS NULL OR a.created_at <= p_to)
  ORDER BY a.created_at DESC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
