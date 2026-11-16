-- Live definition of sol_audit_platform_guc() (last changed in drizzle/0068_audit_log_platform_select.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_audit_platform_guc()
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(nullif(current_setting('app.audit_platform', true), ''), '0') = '1'
$$;
