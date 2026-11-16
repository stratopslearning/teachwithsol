-- Live definition of sol_workspace_documents() (last changed in drizzle/0056_course_knowledge_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_workspace_documents(
  p_workspace_id uuid,
  p_user_id uuid,
  p_coordinator boolean
)
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
    kd.created_at,
    kd.updated_at
  FROM knowledge_documents kd
  WHERE kd.workspace_id = p_workspace_id
    AND kd.deleted_at IS NULL
    AND (
      p_coordinator
      OR kd.visibility = 'workspace'
      OR (
        kd.visibility = 'personal'
        AND kd.created_by_user_id = p_user_id
      )
    )
  ORDER BY kd.updated_at DESC;
$$;
REVOKE ALL ON FUNCTION sol_workspace_documents(uuid, uuid, boolean) FROM PUBLIC;
