-- Soft-delete a single module item (faculty Modules trash on a row).

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

--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_soft_delete_module_item(uuid, uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_soft_delete_module_item(uuid, uuid) TO sol_app;
  END IF;
END
$$;

--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_soft_delete_module_item(uuid, uuid) OWNER TO neondb_owner;
  END IF;
END
$$;
