-- Live definition of sol_authoring_messages_for_outline() (last changed in drizzle/0059_course_authoring_chunks.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_authoring_messages_for_outline(
  p_outline_id uuid,
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  id uuid,
  outline_id uuid,
  role text,
  content text,
  created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT m.id, m.outline_id, m.role::text, m.content, m.created_at
  FROM authoring_messages m
  WHERE m.outline_id = p_outline_id
  ORDER BY m.created_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 40), 1);
$$;
REVOKE ALL ON FUNCTION sol_authoring_messages_for_outline(uuid, integer) FROM PUBLIC;
