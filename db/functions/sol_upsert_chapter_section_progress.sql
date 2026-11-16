-- Live definition of sol_upsert_chapter_section_progress() (last changed in drizzle/0101_interactive_chapters.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_chapter_section_progress(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson uuid := (p_payload->>'lessonId')::uuid;
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_section text := NULLIF(trim(p_payload->>'sectionId'), '');
  v_passed boolean := COALESCE((p_payload->>'passed')::boolean, false);
  v_tenant uuid;
  v_row interactive_chapter_progress%ROWTYPE;
BEGIN
  IF v_lesson IS NULL OR v_student IS NULL OR v_section IS NULL THEN
    RAISE EXCEPTION 'lessonId, studentId, and sectionId required';
  END IF;
  SELECT COALESCE(l.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  WHERE l.id = v_lesson AND l.deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Lesson not found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  INSERT INTO interactive_chapter_progress (
    lesson_id, student_id, tenant_id, section_id, attempts, passed, last_submitted_at, updated_at
  ) VALUES (
    v_lesson, v_student, v_tenant, v_section, 1, v_passed, now(), now()
  )
  ON CONFLICT (lesson_id, student_id, section_id) DO UPDATE SET
    attempts = interactive_chapter_progress.attempts + 1,
    passed = interactive_chapter_progress.passed OR EXCLUDED.passed,
    last_submitted_at = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
