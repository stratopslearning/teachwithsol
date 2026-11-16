-- Live definition of sol_knowledge_version_by_id() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_knowledge_version_by_id(p_version_id uuid)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  s3_key text,
  checksum text,
  mime_type text,
  byte_size integer,
  version integer,
  ocr_used boolean,
  char_count integer,
  tenant_id uuid
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT v.id, v.document_id, v.s3_key, v.checksum, v.mime_type, v.byte_size,
         v.version, v.ocr_used, v.char_count, v.tenant_id
  FROM knowledge_document_versions v
  WHERE v.id = p_version_id;
$$;
REVOKE ALL ON FUNCTION sol_knowledge_version_by_id(uuid) FROM PUBLIC;
