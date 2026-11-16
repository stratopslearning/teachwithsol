-- Live definition of sol_admin_fetch_section() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_fetch_section(p_section_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT to_jsonb(s.*) FROM sections s WHERE s.id = p_section_id;
$$;
REVOKE ALL ON FUNCTION sol_admin_fetch_section(uuid) FROM PUBLIC;
