-- Live definition of sol_interactive_section_ids() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_interactive_section_ids(p_interactive_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_ids uuid[];
BEGIN
  IF p_interactive_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  SELECT tenant_id INTO v_tenant
  FROM interactives
  WHERE id = p_interactive_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  SELECT COALESCE(array_agg(section_id), ARRAY[]::uuid[])
  INTO v_ids
  FROM interactive_sections
  WHERE interactive_id = p_interactive_id;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION sol_interactive_section_ids(uuid) FROM PUBLIC;
