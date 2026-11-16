-- Live definition of sol_mark_outline_item_published() (last changed in drizzle/0062_authoring_rls_writes.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_mark_outline_item_published(
  p_item_id uuid,
  p_published_quiz_id uuid DEFAULT NULL,
  p_published_chatbot_id uuid DEFAULT NULL,
  p_published_lesson_id uuid DEFAULT NULL,
  p_published_interactive_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE outline_items
  SET
    status = 'PUBLISHED',
    published_quiz_id = COALESCE(p_published_quiz_id, published_quiz_id),
    published_chatbot_id = COALESCE(p_published_chatbot_id, published_chatbot_id),
    published_lesson_id = COALESCE(p_published_lesson_id, published_lesson_id),
    published_interactive_id = COALESCE(
      p_published_interactive_id,
      published_interactive_id
    ),
    updated_at = now()
  WHERE id = p_item_id
    AND deleted_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION sol_mark_outline_item_published(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
