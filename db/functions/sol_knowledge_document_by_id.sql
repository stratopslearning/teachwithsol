-- Live definition of sol_knowledge_document_by_id() (last changed in drizzle/0060_knowledge_document_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_knowledge_document_by_id(p_document_id uuid)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  title text,
  visibility text,
  created_by_user_id uuid,
  deleted_at timestamptz,
  current_version_id uuid,
  status text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    kd.id,
    kd.workspace_id,
    kd.title,
    kd.visibility::text,
    kd.created_by_user_id,
    kd.deleted_at,
    kd.current_version_id,
    kd.status::text
  FROM knowledge_documents kd
  WHERE kd.id = p_document_id;
$$;
REVOKE ALL ON FUNCTION sol_knowledge_document_by_id(uuid) FROM PUBLIC;
