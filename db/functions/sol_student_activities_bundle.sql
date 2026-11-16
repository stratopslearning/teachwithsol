-- Live definition of sol_student_activities_bundle() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

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
