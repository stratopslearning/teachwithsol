-- Live definition of sol_section_detail() (last changed in drizzle/0070_section_detail_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_section_detail(p_section_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_section sections%ROWTYPE;
  v_course courses%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_section
  FROM sections s
  WHERE s.id = p_section_id AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_course
  FROM courses c
  WHERE c.id = v_section.course_id AND c.deleted_at IS NULL;

  SELECT jsonb_build_object(
    'section', jsonb_build_object(
      'id', v_section.id,
      'name', v_section.name,
      'courseId', v_section.course_id,
      'professorEnrollmentCode', v_section.professor_enrollment_code,
      'studentEnrollmentCode', v_section.student_enrollment_code,
      'endsAt', v_section.ends_at,
      'createdAt', v_section.created_at,
      'updatedAt', v_section.updated_at,
      'course', CASE
        WHEN v_course.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', v_course.id,
          'title', v_course.title,
          'description', v_course.description
        )
      END
    ),
    'learnerEnrollments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ss.id,
          'enrolledAt', ss.enrolled_at,
          'status', ss.status,
          'person', jsonb_build_object(
            'id', u.id,
            'firstName', u.first_name,
            'lastName', u.last_name,
            'email', u.email
          )
        )
        ORDER BY lower(COALESCE(u.last_name, '')), lower(COALESCE(u.first_name, ''))
      )
      FROM student_sections ss
      JOIN users u ON u.id = ss.student_id
      WHERE ss.section_id = p_section_id
    ), '[]'::jsonb),
    'facultyEnrollments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ps.id,
          'enrolledAt', ps.enrolled_at,
          'status', ps.status,
          'person', jsonb_build_object(
            'id', u.id,
            'firstName', u.first_name,
            'lastName', u.last_name,
            'email', u.email
          )
        )
        ORDER BY lower(COALESCE(u.last_name, '')), lower(COALESCE(u.first_name, ''))
      )
      FROM professor_sections ps
      JOIN users u ON u.id = ps.professor_id
      WHERE ps.section_id = p_section_id
    ), '[]'::jsonb),
    'quizzes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'title', q.title,
          'description', q.description,
          'endDate', q.end_date,
          'submissionCount', COALESCE((
            SELECT count(*)::int
            FROM attempts a
            WHERE a.section_id = p_section_id
              AND a.quiz_id = q.id
              AND a.submitted_at IS NOT NULL
          ), 0)
        )
        ORDER BY q.title
      )
      FROM quiz_sections qs
      JOIN quizzes q ON q.id = qs.quiz_id AND q.deleted_at IS NULL
      WHERE qs.section_id = p_section_id
    ), '[]'::jsonb),
    'discussions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cb.id,
          'title', cb.title,
          'personaName', cb.persona_name,
          'relatedQuizTitle', rq.title
        )
        ORDER BY cb.title
      )
      FROM chatbot_sections cs
      JOIN chatbots cb
        ON cb.id = cs.chatbot_id
       AND cb.deleted_at IS NULL
       AND cb.is_active
       AND NOT cb.is_template
      LEFT JOIN quizzes rq ON rq.id = cb.related_quiz_id
      WHERE cs.section_id = p_section_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION sol_section_detail(uuid) FROM PUBLIC;
