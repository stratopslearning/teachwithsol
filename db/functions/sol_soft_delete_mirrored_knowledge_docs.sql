-- Live definition of sol_soft_delete_mirrored_knowledge_docs() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_soft_delete_mirrored_knowledge_docs(p_material_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mid uuid;
  v_tenant uuid;
  v_count int := 0;
BEGIN
  FOREACH v_mid IN ARRAY p_material_ids
  LOOP
    SELECT COALESCE(tenant_id, workspace_id) INTO v_tenant
    FROM knowledge_documents
    WHERE legacy_material_id = v_mid AND deleted_at IS NULL
    LIMIT 1;
    IF v_tenant IS NOT NULL THEN
      PERFORM set_config('app.tenant_id', v_tenant::text, true);
    END IF;
    UPDATE knowledge_documents
    SET deleted_at = now(), updated_at = now()
    WHERE legacy_material_id = v_mid AND deleted_at IS NULL;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION sol_soft_delete_mirrored_knowledge_docs(uuid[]) FROM PUBLIC;
