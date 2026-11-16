-- Live definition of sol_upsert_lesson_progress() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_lesson_progress(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson uuid := (p_payload->>'lessonId')::uuid;
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_status text := p_payload->>'status';
  v_tenant uuid;
  v_row lesson_progress%ROWTYPE;
BEGIN
  IF v_lesson IS NULL OR v_student IS NULL OR v_status IS NULL THEN
    RAISE EXCEPTION 'lessonId, studentId, status required';
  END IF;
  SELECT COALESCE(l.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM lessons l JOIN courses c ON c.id = l.course_id
  WHERE l.id = v_lesson;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Lesson not found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  SELECT * INTO v_row
  FROM lesson_progress
  WHERE lesson_id = v_lesson AND student_id = v_student;

  IF NOT FOUND THEN
    INSERT INTO lesson_progress (
      lesson_id, student_id, tenant_id, status, completed_at
    ) VALUES (
      v_lesson, v_student, v_tenant, v_status,
      CASE WHEN v_status = 'COMPLETED' THEN now() ELSE NULL END
    )
    RETURNING * INTO v_row;
  ELSE
    IF v_row.status = 'COMPLETED' AND v_status = 'STARTED' THEN
      RAISE EXCEPTION 'Lesson is already completed';
    END IF;
    UPDATE lesson_progress SET
      status = v_status,
      completed_at = CASE
        WHEN v_status = 'COMPLETED' THEN COALESCE(completed_at, now())
        ELSE completed_at
      END,
      updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_upsert_lesson_progress(jsonb) FROM PUBLIC;
