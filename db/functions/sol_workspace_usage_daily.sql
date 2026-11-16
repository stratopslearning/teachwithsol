-- Live definition of sol_workspace_usage_daily() (last changed in drizzle/0077_workspace_read_columns.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE FUNCTION sol_workspace_usage_daily(p_workspace_id uuid, p_limit integer DEFAULT 30)
RETURNS TABLE (
  id uuid,
  day text,
  grade_units integer,
  tutor_units integer,
  embed_units integer,
  updated_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT u.id, u.day, u.grade_units, u.tutor_units, u.embed_units, u.updated_at
  FROM workspace_usage_daily u
  WHERE u.workspace_id = p_workspace_id
  ORDER BY u.day DESC
  LIMIT GREATEST(p_limit, 1);
$$;
