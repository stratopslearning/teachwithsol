-- Live definition of tenant_root() (last changed in drizzle/0042_tenantize_remaining.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION tenant_root(p_workspace_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cur uuid := p_workspace_id;
  parent uuid;
  guard int := 0;
BEGIN
  IF cur IS NULL THEN
    RETURN NULL;
  END IF;
  LOOP
    SELECT w.parent_workspace_id INTO parent
    FROM workspaces w
    WHERE w.id = cur;
    IF parent IS NULL THEN
      RETURN cur;
    END IF;
    cur := parent;
    guard := guard + 1;
    IF guard > 64 THEN
      RAISE EXCEPTION 'tenant_root: parent cycle or depth > 64 for %', p_workspace_id;
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION tenant_root(uuid) TO sol_app;
GRANT EXECUTE ON FUNCTION tenant_root(uuid) TO PUBLIC;
