-- Live definition of sol_admin_overview_stats() (last changed in drizzle/0054_admin_platform_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_overview_stats()
RETURNS TABLE (
  workspace_count integer,
  pending_invite_count integer,
  unpaid_license_count integer,
  course_count integer,
  ongoing_section_count integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    (SELECT count(*)::int FROM workspaces) AS workspace_count,
    (SELECT count(*)::int FROM workspace_invites WHERE claimed_at IS NULL) AS pending_invite_count,
    (
      SELECT count(*)::int
      FROM workspace_licenses
      WHERE billing_provider = 'stripe'
        AND (status = 'trialing' OR stripe_subscription_id IS NULL)
    ) AS unpaid_license_count,
    (SELECT count(*)::int FROM courses WHERE deleted_at IS NULL) AS course_count,
    (
      SELECT count(*)::int
      FROM sections
      WHERE deleted_at IS NULL
        AND is_active = true
        AND (ends_at IS NULL OR ends_at > now())
    ) AS ongoing_section_count;
$$;
REVOKE ALL ON FUNCTION sol_admin_overview_stats() FROM PUBLIC;
