-- Live definition of sol_workspace_audit_rows() (last changed in drizzle/0077_workspace_read_columns.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE FUNCTION sol_workspace_audit_rows(p_workspace_id uuid, p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  action text,
  created_at timestamptz,
  actor_user_id uuid,
  actor_clerk_id text,
  target_type text,
  target_id text,
  metadata jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    a.id,
    a.action,
    a.created_at,
    a.actor_user_id,
    a.actor_clerk_id,
    a.target_type,
    a.target_id,
    a.metadata
  FROM audit_log a
  WHERE a.tenant_id = p_workspace_id
  ORDER BY a.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;
