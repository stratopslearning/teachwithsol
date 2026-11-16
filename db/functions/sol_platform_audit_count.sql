-- Live definition of sol_platform_audit_count() (last changed in drizzle/0078_platform_audit_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_platform_audit_count(
  p_action text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::int
  FROM audit_log a
  WHERE (p_action IS NULL OR a.action = p_action)
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (p_from IS NULL OR a.created_at >= p_from)
    AND (p_to IS NULL OR a.created_at <= p_to);
$$;
