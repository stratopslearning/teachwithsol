-- Live definition of sol_soft_delete_module_item() (last changed in drizzle/0108_soft_delete_module_item.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_soft_delete_module_item(
  p_module_id uuid,
  p_item_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM course_modules
  WHERE id = p_module_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'module_not_found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE module_items
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_item_id
    AND module_id = p_module_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'module_item_not_found';
  END IF;

  RETURN p_item_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_soft_delete_module_item(uuid, uuid) FROM PUBLIC;
