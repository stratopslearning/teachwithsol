-- Live definition of sol_list_course_activities() (last changed in drizzle/0065_list_course_activities.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_course_activities(p_course_id uuid)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  description text,
  course_id uuid,
  course_title text,
  professor_id uuid,
  is_active boolean,
  start_date timestamptz,
  end_date timestamptz,
  "position" integer,
  quiz_id uuid,
  lesson_id uuid,
  chatbot_id uuid,
  interactive_id uuid,
  interactive_kind text,
  section_ids uuid[],
  section_names text[],
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    ca.id,
    ca.type,
    ca.title,
    ca.description,
    ca.course_id,
    c.title AS course_title,
    ca.professor_id,
    ca.is_active,
    ca.start_date,
    ca.end_date,
    ca.position AS "position",
    ca.quiz_id,
    ca.lesson_id,
    ca.chatbot_id,
    ca.interactive_id,
    i.kind AS interactive_kind,
    COALESCE(secs.ids, '{}'::uuid[]) AS section_ids,
    COALESCE(secs.names, '{}'::text[]) AS section_names,
    ca.updated_at
  FROM course_activities ca
  LEFT JOIN courses c ON c.id = ca.course_id
  LEFT JOIN interactives i ON i.id = ca.interactive_id
  LEFT JOIN LATERAL (
    SELECT
      array_agg(x.section_id ORDER BY x.name) AS ids,
      array_agg(x.name ORDER BY x.name) AS names
    FROM (
      SELECT qs.section_id, s.name
      FROM quiz_sections qs
      JOIN sections s ON s.id = qs.section_id
      WHERE ca.type = 'QUIZ'
        AND ca.quiz_id IS NOT NULL
        AND qs.quiz_id = ca.quiz_id
      UNION ALL
      SELECT ls.section_id, s.name
      FROM lesson_sections ls
      JOIN sections s ON s.id = ls.section_id
      WHERE ca.type = 'LESSON'
        AND ca.lesson_id IS NOT NULL
        AND ls.lesson_id = ca.lesson_id
      UNION ALL
      SELECT cs.section_id, s.name
      FROM chatbot_sections cs
      JOIN sections s ON s.id = cs.section_id
      WHERE ca.type = 'DISCUSSION'
        AND ca.chatbot_id IS NOT NULL
        AND cs.chatbot_id = ca.chatbot_id
      UNION ALL
      SELECT iss.section_id, s.name
      FROM interactive_sections iss
      JOIN sections s ON s.id = iss.section_id
      WHERE ca.type = 'INTERACTIVE'
        AND ca.interactive_id IS NOT NULL
        AND iss.interactive_id = ca.interactive_id
    ) x
  ) secs ON true
  WHERE ca.course_id = p_course_id
    AND ca.deleted_at IS NULL
  ORDER BY ca.updated_at DESC;
$$;
REVOKE ALL ON FUNCTION sol_list_course_activities(uuid) FROM PUBLIC;
