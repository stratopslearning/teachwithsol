-- Live definition of sol_lesson_flashcards() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_lesson_flashcards(p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_lesson_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(l.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM lessons l JOIN courses c ON c.id = l.course_id
  WHERE l.id = p_lesson_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'front', f.front,
          'back', f.back,
          'position', f.position
        )
        ORDER BY f.position ASC
      )
      FROM flashcards f
      WHERE f.lesson_id = p_lesson_id AND f.deleted_at IS NULL
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_lesson_flashcards(uuid) FROM PUBLIC;
