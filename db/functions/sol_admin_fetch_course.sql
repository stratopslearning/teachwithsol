-- Live definition of sol_admin_fetch_course() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_fetch_course(p_course_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT to_jsonb(c.*) FROM courses c WHERE c.id = p_course_id;
$$;
REVOKE ALL ON FUNCTION sol_admin_fetch_course(uuid) FROM PUBLIC;
