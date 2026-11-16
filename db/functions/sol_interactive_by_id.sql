-- Live definition of sol_interactive_by_id() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_interactive_by_id(p_interactive_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row interactives%ROWTYPE;
BEGIN
  IF p_interactive_id IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(i.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM interactives i JOIN courses c ON c.id = i.course_id
  WHERE i.id = p_interactive_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  SELECT * INTO v_row FROM interactives WHERE id = p_interactive_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_interactive_by_id(uuid) FROM PUBLIC;
