-- Live definition of sol_set_knowledge_document_title() (last changed in drizzle/0067_knowledge_document_title_definer.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_knowledge_document_title(
  p_document_id uuid,
  p_title text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'documentId required';
  END IF;

  UPDATE knowledge_documents
  SET
    title = COALESCE(NULLIF(trim(p_title), ''), 'Untitled'),
    updated_at = now()
  WHERE id = p_document_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found: %', p_document_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION sol_set_knowledge_document_title(uuid, text) FROM PUBLIC;
