-- Live definition of sol_fetch_provisioned_workspace() (last changed in drizzle/0081_fetch_provisioned_workspace.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_fetch_provisioned_workspace(p_id uuid)
RETURNS TABLE (
  workspace jsonb,
  license jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    to_jsonb(w.*) AS workspace,
    to_jsonb(l.*) AS license
  FROM workspaces w
  LEFT JOIN LATERAL (
    SELECT *
    FROM workspace_licenses wl
    WHERE wl.workspace_id = w.id
    ORDER BY
      CASE WHEN wl.status IN ('active', 'trialing') THEN 0 ELSE 1 END,
      wl.created_at DESC NULLS LAST
    LIMIT 1
  ) l ON true
  WHERE w.id = p_id;
$$;
REVOKE ALL ON FUNCTION sol_fetch_provisioned_workspace(uuid) FROM PUBLIC;
