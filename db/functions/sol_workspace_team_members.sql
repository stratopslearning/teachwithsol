-- Live definition of sol_workspace_team_members() (last changed in drizzle/0053_faculty_student_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_workspace_team_members(p_workspace_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  role text,
  status text,
  created_at timestamptz,
  user_name text,
  user_email text,
  user_first_name text,
  user_last_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT m.id, m.user_id, m.role::text, m.status::text, m.created_at,
         nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
         u.email,
         u.first_name,
         u.last_name
  FROM workspace_memberships m
  JOIN users u ON u.id = m.user_id
  WHERE m.workspace_id = p_workspace_id AND m.status = 'active'
  ORDER BY m.created_at DESC
  LIMIT 50;
$$;
