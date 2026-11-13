-- sol_set_course_material_status was owned by sol_migrator (no BYPASSRLS).
-- Under FORCE RLS it could not read course_materials before setting
-- app.tenant_id, so READY updates after book RAG indexing silently no-oped.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_set_course_material_status(uuid, text, text) OWNER TO neondb_owner;
  END IF;
END
$$;
