-- Live definition of sol_user_active_memberships_detail() (last changed in drizzle/0077_workspace_read_columns.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE FUNCTION sol_user_active_memberships_detail(p_user_id uuid)
RETURNS TABLE (
  membership_id uuid,
  membership_role text,
  membership_status text,
  membership_created_at timestamptz,
  membership_updated_at timestamptz,
  workspace_id uuid,
  workspace_slug text,
  workspace_name text,
  workspace_type text,
  workspace_status text,
  workspace_parent_id uuid,
  workspace_settings jsonb,
  workspace_created_at timestamptz,
  workspace_updated_at timestamptz,
  license_id uuid,
  license_plan text,
  license_seat_cap integer,
  license_status text,
  license_billing_provider text,
  license_stripe_subscription_id text,
  license_period_end timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    m.id,
    m.role::text,
    m.status::text,
    m.created_at,
    m.updated_at,
    w.id,
    w.slug,
    w.name,
    w.type::text,
    w.status::text,
    w.parent_workspace_id,
    w.settings,
    w.created_at,
    w.updated_at,
    lic.id,
    lic.plan::text,
    lic.seat_cap,
    lic.status::text,
    lic.billing_provider::text,
    lic.stripe_subscription_id,
    lic.period_end
  FROM workspace_memberships m
  JOIN workspaces w ON w.id = m.workspace_id
  LEFT JOIN LATERAL (
    SELECT
      l.id,
      l.plan,
      l.seat_cap,
      l.status,
      l.billing_provider,
      l.stripe_subscription_id,
      l.period_end
    FROM workspace_licenses l
    WHERE l.workspace_id = w.id
    ORDER BY l.created_at DESC NULLS LAST
    LIMIT 1
  ) lic ON true
  WHERE m.user_id = p_user_id
    AND m.status = 'active'
  ORDER BY m.created_at DESC;
$$;
