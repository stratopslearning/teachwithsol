-- Live definition of sol_admin_delete_user() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM users WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_admin_delete_user(uuid) FROM PUBLIC;
