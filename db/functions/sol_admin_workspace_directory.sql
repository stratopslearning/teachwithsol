-- Live definition of sol_admin_workspace_directory() (last changed in drizzle/0080_admin_workspace_stripe_sub.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_workspace_directory()
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  type text,
  status text,
  parent_workspace_id uuid,
  created_at timestamptz,
  seat_cap integer,
  license_plan text,
  license_status text,
  billing_provider text,
  license_period_end timestamptz,
  stripe_subscription_id text,
  owner_email text,
  claim_status text,
  course_count integer,
  open_invite_count integer,
  child_count integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH license AS (
    SELECT DISTINCT ON (workspace_id)
      workspace_id, plan, status, billing_provider, seat_cap, period_end,
      stripe_subscription_id
    FROM workspace_licenses
    ORDER BY workspace_id, created_at DESC
  ),
  owner_member AS (
    SELECT DISTINCT ON (m.workspace_id)
      m.workspace_id, u.email
    FROM workspace_memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.role = 'owner' AND m.status = 'active'
    ORDER BY m.workspace_id, m.created_at ASC
  ),
  latest_invite AS (
    SELECT DISTINCT ON (workspace_id)
      workspace_id, email, claimed_at, expires_at, created_at
    FROM workspace_invites
    ORDER BY workspace_id, created_at DESC
  ),
  course_counts AS (
    SELECT workspace_id, count(*)::int AS n
    FROM courses
    WHERE deleted_at IS NULL
    GROUP BY workspace_id
  ),
  open_invites AS (
    SELECT workspace_id, count(*)::int AS n
    FROM workspace_invites
    WHERE claimed_at IS NULL AND expires_at > now()
    GROUP BY workspace_id
  ),
  children AS (
    SELECT parent_workspace_id AS workspace_id, count(*)::int AS n
    FROM workspaces
    WHERE parent_workspace_id IS NOT NULL
    GROUP BY parent_workspace_id
  )
  SELECT
    w.id,
    w.slug,
    w.name,
    w.type::text,
    w.status::text,
    w.parent_workspace_id,
    w.created_at,
    lic.seat_cap,
    lic.plan::text AS license_plan,
    lic.status::text AS license_status,
    lic.billing_provider::text,
    lic.period_end AS license_period_end,
    lic.stripe_subscription_id,
    COALESCE(om.email, li.email) AS owner_email,
    CASE
      WHEN li.claimed_at IS NOT NULL OR om.email IS NOT NULL THEN 'claimed'
      WHEN li.workspace_id IS NULL THEN 'none'
      WHEN li.expires_at < now() THEN 'expired'
      ELSE 'pending'
    END AS claim_status,
    COALESCE(cc.n, 0) AS course_count,
    COALESCE(oi.n, 0) AS open_invite_count,
    COALESCE(ch.n, 0) AS child_count
  FROM workspaces w
  LEFT JOIN license lic ON lic.workspace_id = w.id
  LEFT JOIN owner_member om ON om.workspace_id = w.id
  LEFT JOIN latest_invite li ON li.workspace_id = w.id
  LEFT JOIN course_counts cc ON cc.workspace_id = w.id
  LEFT JOIN open_invites oi ON oi.workspace_id = w.id
  LEFT JOIN children ch ON ch.workspace_id = w.id
  ORDER BY w.created_at DESC;
$$;
REVOKE ALL ON FUNCTION sol_admin_workspace_directory() FROM PUBLIC;
