-- Live definition of sol_set_knowledge_document_visibility() (last changed in drizzle/0064_knowledge_quiz_update_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_knowledge_document_visibility(
  p_document_id uuid,
  p_visibility text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE knowledge_documents
  SET visibility = p_visibility, updated_at = now()
  WHERE id = p_document_id
    AND deleted_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION sol_set_knowledge_document_visibility(uuid, text) FROM PUBLIC;
