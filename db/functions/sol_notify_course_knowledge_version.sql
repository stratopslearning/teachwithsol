-- Live definition of sol_notify_course_knowledge_version() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_notify_course_knowledge_version(
  p_document_id uuid,
  p_new_version_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, tenant_id
    FROM course_knowledge_links
    WHERE document_id = p_document_id
      AND (
        pinned_version_id IS NULL
        OR pinned_version_id IS DISTINCT FROM p_new_version_id
      )
  LOOP
    IF r.tenant_id IS NOT NULL THEN
      PERFORM set_config('app.tenant_id', r.tenant_id::text, true);
    END IF;
    UPDATE course_knowledge_links SET
      update_available_version_id = p_new_version_id,
      update_noticed_at = now(),
      updated_at = now()
    WHERE id = r.id;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION sol_notify_course_knowledge_version(uuid, uuid) FROM PUBLIC;
