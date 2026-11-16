-- Live definition of sol_course_linked_documents() (last changed in drizzle/0056_course_knowledge_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_course_linked_documents(p_course_id uuid)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  title text,
  source_kind text,
  mime_type text,
  byte_size integer,
  status text,
  error_message text,
  external_url text,
  connector_id uuid,
  current_version_id uuid,
  visibility text,
  created_by_user_id uuid,
  authoring_corpus text,
  pinned_version_id uuid,
  update_available_version_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    kd.id,
    kd.workspace_id,
    kd.title,
    kd.source_kind::text,
    kd.mime_type,
    kd.byte_size,
    kd.status::text,
    kd.error_message,
    kd.external_url,
    kd.connector_id,
    kd.current_version_id,
    kd.visibility::text,
    kd.created_by_user_id,
    ckl.authoring_corpus::text,
    ckl.pinned_version_id,
    ckl.update_available_version_id,
    kd.created_at,
    kd.updated_at
  FROM course_knowledge_links ckl
  JOIN knowledge_documents kd ON kd.id = ckl.document_id
  WHERE ckl.course_id = p_course_id
    AND kd.deleted_at IS NULL
  ORDER BY kd.updated_at DESC;
$$;
REVOKE ALL ON FUNCTION sol_course_linked_documents(uuid) FROM PUBLIC;
