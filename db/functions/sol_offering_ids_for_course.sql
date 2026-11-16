-- Live definition of sol_offering_ids_for_course() (last changed in drizzle/0052_entity_resolve_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_offering_ids_for_course(p_course_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT o.id FROM course_offerings o WHERE o.course_id = p_course_id;
$$;
REVOKE ALL ON FUNCTION sol_offering_ids_for_course(uuid) FROM PUBLIC;
