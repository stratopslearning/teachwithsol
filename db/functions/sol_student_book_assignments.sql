-- Live definition of sol_student_book_assignments() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_student_book_assignments(p_section_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_section_ids IS NULL OR cardinality(p_section_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'bookId', hb.id,
          'title', hb.title,
          'courseId', hb.course_id,
          'courseTitle', c.title,
          'sectionId', bs.section_id,
          'sectionName', s.name,
          'status', hb.status,
          'isReleased', hb.is_released
        )
        ORDER BY hb.title ASC
      )
      FROM book_sections bs
      JOIN hosted_books hb ON hb.id = bs.book_id
      JOIN sections s ON s.id = bs.section_id
      JOIN courses c ON c.id = hb.course_id
      WHERE bs.section_id = ANY(p_section_ids)
        AND hb.deleted_at IS NULL
        AND hb.is_released = true
        AND hb.status = 'READY'
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_student_book_assignments(uuid[]) FROM PUBLIC;
