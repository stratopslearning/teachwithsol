-- Student FORCE RLS CRUD pack: exam/quiz take, progress, activities list,
-- gradebook, interactive progress, chatbot session load/write.
-- All SECURITY DEFINER; set app.tenant_id from a known row before nested
-- reads when helpful; end with OWNER TO neondb_owner (BYPASSRLS).

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_load_exam_context(
  p_quiz_id uuid,
  p_assignment_id uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_assignment assignments%ROWTYPE;
  v_quiz quizzes%ROWTYPE;
  v_open attempts%ROWTYPE;
  v_submitted int;
  v_sections jsonb;
BEGIN
  IF p_quiz_id IS NULL OR p_assignment_id IS NULL OR p_student_id IS NULL THEN
    RETURN jsonb_build_object(
      'assignment', NULL,
      'quiz', NULL,
      'inProgressAttempt', NULL,
      'submittedCount', 0,
      'quizSectionLinks', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_assignment
  FROM assignments
  WHERE id = p_assignment_id
    AND quiz_id = p_quiz_id
    AND student_id = p_student_id;

  SELECT * INTO v_quiz
  FROM quizzes
  WHERE id = p_quiz_id AND deleted_at IS NULL;

  IF v_assignment.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_assignment.tenant_id::text, true);
  ELSIF v_quiz.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_quiz.tenant_id::text, true);
  END IF;

  IF v_assignment.id IS NULL OR v_quiz.id IS NULL THEN
    RETURN jsonb_build_object(
      'assignment', CASE WHEN v_assignment.id IS NULL THEN NULL ELSE to_jsonb(v_assignment) END,
      'quiz', CASE WHEN v_quiz.id IS NULL THEN NULL ELSE to_jsonb(v_quiz) END,
      'inProgressAttempt', NULL,
      'submittedCount', 0,
      'quizSectionLinks', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_open
  FROM attempts
  WHERE assignment_id = p_assignment_id
    AND student_id = p_student_id
    AND submitted_at IS NULL
  LIMIT 1;

  SELECT count(*)::int INTO v_submitted
  FROM attempts
  WHERE assignment_id = p_assignment_id
    AND student_id = p_student_id
    AND submitted_at IS NOT NULL;

  SELECT COALESCE(jsonb_agg(to_jsonb(qs) ORDER BY qs.section_id), '[]'::jsonb)
  INTO v_sections
  FROM quiz_sections qs
  WHERE qs.quiz_id = p_quiz_id;

  RETURN jsonb_build_object(
    'assignment', to_jsonb(v_assignment),
    'quiz', to_jsonb(v_quiz),
    'inProgressAttempt', CASE WHEN v_open.id IS NULL THEN NULL ELSE to_jsonb(v_open) END,
    'submittedCount', v_submitted,
    'quizSectionLinks', v_sections
  );
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_resolve_attempt_section(
  p_student_id uuid,
  p_quiz_section_ids uuid[],
  p_preferred_section_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_student_id IS NULL
     OR p_quiz_section_ids IS NULL
     OR cardinality(p_quiz_section_ids) = 0 THEN
    RETURN NULL;
  END IF;

  IF p_preferred_section_id IS NOT NULL
     AND p_preferred_section_id = ANY(p_quiz_section_ids) THEN
    SELECT ss.section_id INTO v_id
    FROM student_sections ss
    WHERE ss.student_id = p_student_id
      AND ss.section_id = p_preferred_section_id
      AND ss.status = 'ACTIVE'
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  SELECT ss.section_id INTO v_id
  FROM student_sections ss
  WHERE ss.student_id = p_student_id
    AND ss.status = 'ACTIVE'
    AND ss.section_id = ANY(p_quiz_section_ids)
  ORDER BY ss.enrolled_at DESC
  LIMIT 1;

  RETURN v_id;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_ensure_quiz_assignment(
  p_quiz_id uuid,
  p_student_id uuid,
  p_due_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_offering uuid;
  v_row assignments%ROWTYPE;
BEGIN
  IF p_quiz_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'quizId and studentId required';
  END IF;

  SELECT q.tenant_id, q.offering_id INTO v_tenant, v_offering
  FROM quizzes q WHERE q.id = p_quiz_id AND q.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found';
  END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  SELECT * INTO v_row
  FROM assignments
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id;

  IF FOUND THEN
    RETURN to_jsonb(v_row);
  END IF;

  INSERT INTO assignments (
    quiz_id, student_id, tenant_id, offering_id, due_date
  ) VALUES (
    p_quiz_id,
    p_student_id,
    v_tenant,
    v_offering,
    COALESCE(p_due_date, now() + interval '7 days')
  )
  ON CONFLICT (quiz_id, student_id) DO NOTHING;

  SELECT * INTO v_row
  FROM assignments
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id;

  RETURN to_jsonb(v_row);
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_quiz_questions_safe(p_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_quiz_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT tenant_id INTO v_tenant FROM quizzes WHERE id = p_quiz_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'quiz_id', q.quiz_id,
          'tenant_id', q.tenant_id,
          'offering_id', q.offering_id,
          'type', q.type,
          'question', q.question,
          'options', q.options,
          'correct_answer', NULL,
          'points', q.points,
          'order', q.order,
          'rubric', NULL,
          'rubric_version', q.rubric_version,
          'rubric_status', q.rubric_status,
          'concept_tags', q.concept_tags,
          'created_at', q.created_at
        )
        ORDER BY q.order
      )
      FROM questions q
      WHERE q.quiz_id = p_quiz_id
    ),
    '[]'::jsonb
  );
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_quiz_take_bundle(
  p_quiz_id uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz quizzes%ROWTYPE;
  v_section_ids uuid[];
  v_resolved uuid;
  v_section sections%ROWTYPE;
  v_assignment jsonb;
  v_questions jsonb;
  v_open attempts%ROWTYPE;
BEGIN
  IF p_quiz_id IS NULL OR p_student_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_quiz
  FROM quizzes
  WHERE id = p_quiz_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_quiz.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_quiz.tenant_id::text, true);
  END IF;

  SELECT COALESCE(array_agg(qs.section_id), ARRAY[]::uuid[])
  INTO v_section_ids
  FROM quiz_sections qs
  WHERE qs.quiz_id = p_quiz_id;

  v_resolved := sol_resolve_attempt_section(p_student_id, v_section_ids, NULL);

  IF v_resolved IS NOT NULL THEN
    SELECT * INTO v_section FROM sections WHERE id = v_resolved;
  END IF;

  v_assignment := sol_ensure_quiz_assignment(
    p_quiz_id,
    p_student_id,
    now() + interval '7 days'
  );

  v_questions := sol_quiz_questions_safe(p_quiz_id);

  SELECT * INTO v_open
  FROM attempts
  WHERE quiz_id = p_quiz_id
    AND student_id = p_student_id
    AND submitted_at IS NULL
  LIMIT 1;

  RETURN jsonb_build_object(
    'quiz', to_jsonb(v_quiz),
    'quizSectionIds', to_jsonb(v_section_ids),
    'resolvedSectionId', v_resolved,
    'section', CASE WHEN v_section.id IS NULL THEN NULL ELSE to_jsonb(v_section) END,
    'assignment', v_assignment,
    'questions', v_questions,
    'inProgressAttempt', CASE WHEN v_open.id IS NULL THEN NULL ELSE to_jsonb(v_open) END
  );
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_update_attempt_answers(
  p_attempt_id uuid,
  p_student_id uuid,
  p_answers jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_attempt_id IS NULL OR p_student_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(a.tenant_id, q.tenant_id) INTO v_tenant
  FROM attempts a
  JOIN quizzes q ON q.id = a.quiz_id
  WHERE a.id = p_attempt_id
    AND a.student_id = p_student_id
    AND a.submitted_at IS NULL;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  UPDATE attempts
  SET answers = COALESCE(p_answers, answers)
  WHERE id = p_attempt_id
    AND student_id = p_student_id
    AND submitted_at IS NULL;

  RETURN FOUND;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_attempt_with_quiz_assignment(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt attempts%ROWTYPE;
  v_quiz quizzes%ROWTYPE;
  v_assignment assignments%ROWTYPE;
BEGIN
  IF p_attempt_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_attempt FROM attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_attempt.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_attempt.tenant_id::text, true);
  END IF;

  SELECT * INTO v_quiz FROM quizzes WHERE id = v_attempt.quiz_id;
  SELECT * INTO v_assignment FROM assignments WHERE id = v_attempt.assignment_id;

  RETURN jsonb_build_object(
    'attempt', to_jsonb(v_attempt),
    'quiz', CASE WHEN v_quiz.id IS NULL THEN NULL ELSE to_jsonb(v_quiz) END,
    'assignment', CASE WHEN v_assignment.id IS NULL THEN NULL ELSE to_jsonb(v_assignment) END
  );
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_student_enrolled_in_quiz(
  p_student_id uuid,
  p_quiz_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM quiz_sections qs
    JOIN student_sections ss ON ss.section_id = qs.section_id
    WHERE qs.quiz_id = p_quiz_id
      AND ss.student_id = p_student_id
      AND ss.status = 'ACTIVE'
  );
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_student_gradebook_attempts(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF p_student_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x."submittedAt" DESC NULLS LAST)
      FROM (
        SELECT
          a.id,
          a.quiz_id AS "quizId",
          a.section_id AS "sectionId",
          s.name AS "sectionName",
          q.title AS "quizTitle",
          c.title AS "courseTitle",
          a.submitted_at AS "submittedAt",
          a.score,
          a.max_score AS "maxScore",
          a.percentage,
          a.passed,
          s.ends_at AS "sectionEndsAt"
        FROM attempts a
        JOIN quizzes q ON q.id = a.quiz_id
        JOIN sections s ON s.id = a.section_id
        LEFT JOIN courses c ON c.id = s.course_id
        WHERE a.student_id = p_student_id
          AND a.submitted_at IS NOT NULL
        ORDER BY a.submitted_at DESC
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_student_activities_bundle(
  p_student_id uuid,
  p_section_ids uuid[],
  p_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz_ids uuid[];
  v_lesson_ids uuid[];
  v_chatbot_ids uuid[];
  v_interactive_ids uuid[];
BEGIN
  IF p_student_id IS NULL
     OR p_section_ids IS NULL
     OR cardinality(p_section_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT qs.quiz_id), ARRAY[]::uuid[])
  INTO v_quiz_ids
  FROM quiz_sections qs
  WHERE qs.section_id = ANY(p_section_ids);

  SELECT COALESCE(array_agg(DISTINCT ls.lesson_id), ARRAY[]::uuid[])
  INTO v_lesson_ids
  FROM lesson_sections ls
  WHERE ls.section_id = ANY(p_section_ids);

  SELECT COALESCE(array_agg(DISTINCT cs.chatbot_id), ARRAY[]::uuid[])
  INTO v_chatbot_ids
  FROM chatbot_sections cs
  WHERE cs.section_id = ANY(p_section_ids);

  SELECT COALESCE(array_agg(DISTINCT isec.interactive_id), ARRAY[]::uuid[])
  INTO v_interactive_ids
  FROM interactive_sections isec
  WHERE isec.section_id = ANY(p_section_ids);

  IF cardinality(v_quiz_ids) = 0
     AND cardinality(v_lesson_ids) = 0
     AND cardinality(v_chatbot_ids) = 0
     AND cardinality(v_interactive_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x."updatedAt" DESC)
      FROM (
        SELECT
          ca.id,
          ca.type,
          ca.title,
          ca.description,
          ca.course_id AS "courseId",
          c.title AS "courseTitle",
          ca.professor_id AS "professorId",
          ca.is_active AS "isActive",
          ca.start_date AS "startDate",
          ca.end_date AS "endDate",
          ca.position,
          ca.quiz_id AS "quizId",
          ca.lesson_id AS "lessonId",
          ca.chatbot_id AS "chatbotId",
          ca.interactive_id AS "interactiveId",
          i.kind AS "interactiveKind",
          q.max_attempts AS "maxAttempts",
          q.start_date AS "quizStartDate",
          q.end_date AS "quizEndDate",
          ca.updated_at AS "updatedAt",
          (
            SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
              'id', sec.id,
              'name', sec.name
            )), '[]'::jsonb)
            FROM (
              SELECT s.id, s.name
              FROM quiz_sections qs2
              JOIN sections s ON s.id = qs2.section_id
              WHERE ca.quiz_id IS NOT NULL
                AND qs2.quiz_id = ca.quiz_id
                AND qs2.section_id = ANY(p_section_ids)
              UNION
              SELECT s.id, s.name
              FROM lesson_sections ls2
              JOIN sections s ON s.id = ls2.section_id
              WHERE ca.lesson_id IS NOT NULL
                AND ls2.lesson_id = ca.lesson_id
                AND ls2.section_id = ANY(p_section_ids)
              UNION
              SELECT s.id, s.name
              FROM chatbot_sections cs2
              JOIN sections s ON s.id = cs2.section_id
              WHERE ca.chatbot_id IS NOT NULL
                AND cs2.chatbot_id = ca.chatbot_id
                AND cs2.section_id = ANY(p_section_ids)
              UNION
              SELECT s.id, s.name
              FROM interactive_sections is2
              JOIN sections s ON s.id = is2.section_id
              WHERE ca.interactive_id IS NOT NULL
                AND is2.interactive_id = ca.interactive_id
                AND is2.section_id = ANY(p_section_ids)
            ) sec
          ) AS sections,
          (
            SELECT jsonb_build_object(
              'bestPercentage',
                (
                  SELECT max(
                    COALESCE(
                      a.percentage,
                      CASE WHEN a.max_score > 0
                        THEN round((a.score::numeric / a.max_score) * 100)::int
                        ELSE 0
                      END
                    )
                  )
                  FROM attempts a
                  WHERE a.student_id = p_student_id
                    AND a.quiz_id = ca.quiz_id
                    AND a.submitted_at IS NOT NULL
                ),
              'attemptCount',
                (
                  SELECT count(*)::int
                  FROM attempts a
                  WHERE a.student_id = p_student_id
                    AND a.quiz_id = ca.quiz_id
                    AND a.submitted_at IS NOT NULL
                )
            )
            WHERE ca.type = 'QUIZ' AND ca.quiz_id IS NOT NULL
          ) AS "quizProgress",
          (
            SELECT lp.status
            FROM lesson_progress lp
            WHERE lp.student_id = p_student_id
              AND lp.lesson_id = ca.lesson_id
            LIMIT 1
          ) AS "lessonStatus",
          (
            SELECT ca2.is_completed
            FROM chatbot_assignments ca2
            WHERE ca2.student_id = p_student_id
              AND ca2.chatbot_id = ca.chatbot_id
            LIMIT 1
          ) AS "chatbotCompleted",
          (
            SELECT EXISTS (
              SELECT 1 FROM chatbot_assignments ca2
              WHERE ca2.student_id = p_student_id
                AND ca2.chatbot_id = ca.chatbot_id
            )
          ) AS "chatbotAssigned",
          (
            SELECT ip.status
            FROM interactive_progress ip
            WHERE ip.student_id = p_student_id
              AND ip.interactive_id = ca.interactive_id
            LIMIT 1
          ) AS "interactiveStatus"
        FROM course_activities ca
        LEFT JOIN courses c ON c.id = ca.course_id
        LEFT JOIN quizzes q ON q.id = ca.quiz_id
        LEFT JOIN interactives i ON i.id = ca.interactive_id
        WHERE ca.deleted_at IS NULL
          AND ca.is_active = true
          AND (p_type IS NULL OR p_type = 'ALL' OR ca.type = p_type)
          AND (
            (ca.quiz_id IS NOT NULL AND ca.quiz_id = ANY(v_quiz_ids))
            OR (ca.lesson_id IS NOT NULL AND ca.lesson_id = ANY(v_lesson_ids))
            OR (ca.chatbot_id IS NOT NULL AND ca.chatbot_id = ANY(v_chatbot_ids))
            OR (ca.interactive_id IS NOT NULL AND ca.interactive_id = ANY(v_interactive_ids))
          )
        ORDER BY ca.updated_at DESC
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_upsert_interactive_progress(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interactive uuid := (p_payload->>'interactiveId')::uuid;
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_status text := p_payload->>'status';
  v_xapi jsonb := p_payload->'xapiSummary';
  v_tenant uuid;
  v_existing interactive_progress%ROWTYPE;
  v_row interactive_progress%ROWTYPE;
BEGIN
  IF v_interactive IS NULL OR v_student IS NULL OR v_status IS NULL THEN
    RAISE EXCEPTION 'interactiveId, studentId, status required';
  END IF;
  IF v_status NOT IN ('STARTED', 'COMPLETED') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  SELECT COALESCE(i.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM interactives i
  LEFT JOIN courses c ON c.id = i.course_id
  WHERE i.id = v_interactive;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  SELECT * INTO v_existing
  FROM interactive_progress
  WHERE interactive_id = v_interactive AND student_id = v_student;

  IF FOUND THEN
    IF v_existing.status = 'COMPLETED' AND v_status = 'STARTED' THEN
      RETURN to_jsonb(v_existing);
    END IF;
    UPDATE interactive_progress SET
      status = v_status,
      completed_at = CASE
        WHEN v_status = 'COMPLETED' THEN COALESCE(completed_at, now())
        ELSE completed_at
      END,
      xapi_summary = COALESCE(v_xapi, xapi_summary),
      tenant_id = COALESCE(tenant_id, v_tenant),
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
    RETURN to_jsonb(v_row);
  END IF;

  INSERT INTO interactive_progress (
    interactive_id, student_id, tenant_id, status, completed_at, xapi_summary
  ) VALUES (
    v_interactive,
    v_student,
    v_tenant,
    v_status,
    CASE WHEN v_status = 'COMPLETED' THEN now() ELSE NULL END,
    v_xapi
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_load_or_create_chatbot_session(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chatbot uuid := (p_payload->>'chatbotId')::uuid;
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_session_id uuid := NULLIF(p_payload->>'sessionId', '')::uuid;
  v_section_id uuid := NULLIF(p_payload->>'sectionId', '')::uuid;
  v_tenant uuid;
  v_offering uuid;
  v_assignment chatbot_assignments%ROWTYPE;
  v_session chatbot_sessions%ROWTYPE;
BEGIN
  IF v_chatbot IS NULL OR v_student IS NULL THEN
    RAISE EXCEPTION 'chatbotId and studentId required';
  END IF;

  SELECT tenant_id, offering_id INTO v_tenant, v_offering
  FROM chatbots WHERE id = v_chatbot;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  SELECT * INTO v_assignment
  FROM chatbot_assignments
  WHERE chatbot_id = v_chatbot AND student_id = v_student;

  IF NOT FOUND THEN
    INSERT INTO chatbot_assignments (
      chatbot_id, student_id, tenant_id, offering_id
    ) VALUES (
      v_chatbot, v_student, v_tenant, v_offering
    )
    ON CONFLICT (chatbot_id, student_id) DO NOTHING;

    SELECT * INTO v_assignment
    FROM chatbot_assignments
    WHERE chatbot_id = v_chatbot AND student_id = v_student;
  END IF;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Failed to ensure chatbot assignment';
  END IF;

  IF v_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM chatbot_sessions
    WHERE id = v_session_id
      AND chatbot_id = v_chatbot
      AND student_id = v_student;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
  ELSE
    SELECT * INTO v_session
    FROM chatbot_sessions
    WHERE assignment_id = v_assignment.id
      AND status = 'in_progress'
    LIMIT 1;

    IF NOT FOUND AND v_assignment.is_completed THEN
      SELECT * INTO v_session
      FROM chatbot_sessions
      WHERE assignment_id = v_assignment.id
        AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF v_session.id IS NULL THEN
      IF v_section_id IS NULL THEN
        RETURN jsonb_build_object(
          'assignment', to_jsonb(v_assignment),
          'session', NULL,
          'needsSection', true
        );
      END IF;

      IF v_tenant IS NULL THEN
        SELECT COALESCE(s.tenant_id, s.workspace_id), s.offering_id
        INTO v_tenant, v_offering
        FROM sections s WHERE s.id = v_section_id;
        IF v_tenant IS NOT NULL THEN
          PERFORM set_config('app.tenant_id', v_tenant::text, true);
        END IF;
      END IF;

      INSERT INTO chatbot_sessions (
        assignment_id, student_id, chatbot_id, section_id,
        tenant_id, offering_id, messages, status
      ) VALUES (
        v_assignment.id, v_student, v_chatbot, v_section_id,
        v_tenant, v_offering, '[]'::jsonb, 'in_progress'
      )
      RETURNING * INTO v_session;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'assignment', to_jsonb(v_assignment),
    'session', to_jsonb(v_session),
    'needsSection', false
  );
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_update_chatbot_session(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := (p_payload->>'sessionId')::uuid;
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_tenant uuid;
  v_row chatbot_sessions%ROWTYPE;
BEGIN
  IF v_session_id IS NULL OR v_student IS NULL THEN
    RAISE EXCEPTION 'sessionId and studentId required';
  END IF;

  SELECT COALESCE(cs.tenant_id, c.tenant_id) INTO v_tenant
  FROM chatbot_sessions cs
  JOIN chatbots c ON c.id = cs.chatbot_id
  WHERE cs.id = v_session_id AND cs.student_id = v_student;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  UPDATE chatbot_sessions SET
    messages = COALESCE(p_payload->'messages', messages),
    session_metadata = COALESCE(p_payload->'sessionMetadata', session_metadata),
    struggle_topics = COALESCE(
      CASE
        WHEN p_payload ? 'struggleTopics' THEN p_payload->'struggleTopics'
        ELSE NULL
      END,
      struggle_topics
    ),
    status = COALESCE(NULLIF(p_payload->>'status', ''), status),
    completed_at = CASE
      WHEN NULLIF(p_payload->>'status', '') = 'completed'
        THEN COALESCE(completed_at, now())
      ELSE completed_at
    END,
    tenant_id = COALESCE(tenant_id, v_tenant)
  WHERE id = v_session_id AND student_id = v_student
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_complete_chatbot_session(
  p_session_id uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session chatbot_sessions%ROWTYPE;
  v_tenant uuid;
BEGIN
  IF p_session_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'sessionId and studentId required';
  END IF;

  SELECT * INTO v_session
  FROM chatbot_sessions
  WHERE id = p_session_id AND student_id = p_student_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_tenant := v_session.tenant_id;
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM chatbots WHERE id = v_session.chatbot_id;
  END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  UPDATE chatbot_sessions
  SET status = 'completed', completed_at = COALESCE(completed_at, now())
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  UPDATE chatbot_assignments
  SET is_completed = true, completed_at = COALESCE(completed_at, now())
  WHERE id = v_session.assignment_id;

  RETURN to_jsonb(v_session);
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_chatbot_session_by_id(
  p_session_id uuid,
  p_student_id uuid,
  p_chatbot_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_row chatbot_sessions%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR p_student_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_row
  FROM chatbot_sessions
  WHERE id = p_session_id
    AND student_id = p_student_id
    AND (p_chatbot_id IS NULL OR chatbot_id = p_chatbot_id);
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_list_open_attempt_ids(p_limit integer DEFAULT 120)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id ORDER BY started_at ASC), ARRAY[]::uuid[])
  INTO v_ids
  FROM (
    SELECT a.id, a.started_at
    FROM attempts a
    WHERE a.submitted_at IS NULL
    ORDER BY a.started_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 120), 1)
  ) x;
  RETURN v_ids;
END;
$$;

--> statement-breakpoint
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'sol_load_exam_context(uuid,uuid,uuid)',
    'sol_resolve_attempt_section(uuid,uuid[],uuid)',
    'sol_ensure_quiz_assignment(uuid,uuid,timestamptz)',
    'sol_quiz_questions_safe(uuid)',
    'sol_quiz_take_bundle(uuid,uuid)',
    'sol_update_attempt_answers(uuid,uuid,jsonb)',
    'sol_attempt_with_quiz_assignment(uuid)',
    'sol_student_enrolled_in_quiz(uuid,uuid)',
    'sol_student_gradebook_attempts(uuid)',
    'sol_student_activities_bundle(uuid,uuid[],text)',
    'sol_upsert_interactive_progress(jsonb)',
    'sol_load_or_create_chatbot_session(jsonb)',
    'sol_update_chatbot_session(jsonb)',
    'sol_complete_chatbot_session(uuid,uuid)',
    'sol_chatbot_session_by_id(uuid,uuid,uuid)',
    'sol_list_open_attempt_ids(integer)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO sol_app', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
       AND (
         pg_has_role(current_user, 'neondb_owner', 'member')
         OR current_user = 'neondb_owner'
       ) THEN
      EXECUTE format('ALTER FUNCTION %s OWNER TO neondb_owner', fn);
    END IF;
  END LOOP;
END
$$;
