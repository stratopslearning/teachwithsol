-- FORCE RLS: CREATE OR REPLACE run as sol_migrator re-assigns SECURITY DEFINER
-- ownership away from neondb_owner (BYPASSRLS). App role sol_app then hits
-- empty RLS when definers SELECT before app.tenant_id is set.
-- Bulk re-own every public sol_* SECURITY DEFINER to neondb_owner.
-- See docs/architecture/tenant-isolation-migration-plan.md and runtime-db-roles.md.

DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    RAISE NOTICE 'neondb_owner missing; skip re-own';
    RETURN;
  END IF;
  IF NOT pg_has_role(current_user, 'neondb_owner', 'member')
     AND current_user <> 'neondb_owner' THEN
    RAISE NOTICE 'current_user % cannot ALTER OWNER TO neondb_owner; skip',
      current_user;
    RETURN;
  END IF;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    JOIN pg_roles own ON own.oid = p.proowner
    WHERE nsp.nspname = 'public'
      AND p.prosecdef
      AND p.proname LIKE 'sol\_%' ESCAPE '\'
      AND NOT own.rolbypassrls
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO neondb_owner', r.sig);
    n := n + 1;
  END LOOP;

  RAISE NOTICE 're-owned % sol_* SECURITY DEFINER function(s) to neondb_owner', n;
END
$$;
