-- Live definition of sol_workspace_pending_invites() (last changed in drizzle/0053_faculty_student_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_workspace_pending_invites(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  expires_at timestamptz,
  created_at timestamptz,
  claimed_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT i.id, i.email, i.role::text, i.expires_at, i.created_at, i.claimed_at
  FROM workspace_invites i
  WHERE i.workspace_id = p_workspace_id AND i.claimed_at IS NULL
  ORDER BY i.created_at DESC
  LIMIT 20;
$$;
