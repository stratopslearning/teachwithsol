-- Live definition of sol_resolve_attempt_section() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

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
