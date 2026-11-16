-- Live definition of sol_user_active_memberships() (last changed in drizzle/0049_user_bindings_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_user_active_memberships(p_user_id uuid)
RETURNS TABLE (
  membership_id uuid,
  workspace_id uuid,
  status text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT m.id, m.workspace_id, m.status::text, m.created_at
  FROM workspace_memberships m
  WHERE m.user_id = p_user_id
    AND m.status = 'active';
$$;
REVOKE ALL ON FUNCTION sol_user_active_memberships(uuid) FROM PUBLIC;
