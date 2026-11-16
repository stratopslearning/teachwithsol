-- Live definition of sol_tenant_guc() (last changed in drizzle/0040_rls_force.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_tenant_guc() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')
$$;
