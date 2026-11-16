-- Live definition of sol_section_rows_for_course() (last changed in drizzle/0052_entity_resolve_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_section_rows_for_course(p_course_id uuid)
RETURNS TABLE (id uuid, offering_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT s.id, s.offering_id
  FROM sections s
  WHERE s.course_id = p_course_id AND s.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_section_rows_for_course(uuid) FROM PUBLIC;
