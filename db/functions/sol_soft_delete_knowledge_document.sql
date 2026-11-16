-- Live definition of sol_soft_delete_knowledge_document() (last changed in drizzle/0064_knowledge_quiz_update_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_soft_delete_knowledge_document(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE knowledge_documents
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_document_id
    AND deleted_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION sol_soft_delete_knowledge_document(uuid) FROM PUBLIC;
