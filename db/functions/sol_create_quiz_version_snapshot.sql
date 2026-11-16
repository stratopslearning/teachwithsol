-- Live definition of sol_create_quiz_version_snapshot() (last changed in drizzle/0062_authoring_rls_writes.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_quiz_version_snapshot(
  p_quiz_id uuid,
  p_created_by uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz quizzes%ROWTYPE;
  v_questions jsonb;
  v_version integer;
  v_snapshot jsonb;
  v_id uuid;
BEGIN
  SELECT * INTO v_quiz FROM quizzes WHERE quizzes.id = p_quiz_id AND quizzes.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found: %', p_quiz_id;
  END IF;
  IF v_quiz.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Quiz missing tenant_id: %', p_quiz_id;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q."order"), '[]'::jsonb)
  INTO v_questions
  FROM questions q
  WHERE q.quiz_id = p_quiz_id;

  SELECT COALESCE(MAX(quiz_versions.version), 0) + 1
  INTO v_version
  FROM quiz_versions
  WHERE quiz_versions.quiz_id = p_quiz_id;

  v_snapshot := jsonb_build_object(
    'quiz', to_jsonb(v_quiz),
    'questions', v_questions,
    'capturedAt', to_jsonb(now())
  );

  INSERT INTO quiz_versions (quiz_id, tenant_id, version, snapshot, created_by)
  VALUES (p_quiz_id, v_quiz.tenant_id, v_version, v_snapshot, p_created_by)
  RETURNING quiz_versions.id INTO v_id;

  id := v_id;
  version := v_version;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION sol_create_quiz_version_snapshot(uuid, uuid) FROM PUBLIC;
