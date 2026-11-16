-- Live definition of sol_knowledge_document_versions() (last changed in drizzle/0060_knowledge_document_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_knowledge_document_versions(p_document_id uuid)
RETURNS TABLE (
  id uuid,
  version integer,
  ocr_used boolean,
  char_count integer,
  created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    kdv.id,
    kdv.version,
    kdv.ocr_used,
    kdv.char_count,
    kdv.created_at
  FROM knowledge_document_versions kdv
  WHERE kdv.document_id = p_document_id
  ORDER BY kdv.version DESC;
$$;
REVOKE ALL ON FUNCTION sol_knowledge_document_versions(uuid) FROM PUBLIC;
