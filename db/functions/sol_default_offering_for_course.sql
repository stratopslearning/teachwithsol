-- Live definition of sol_default_offering_for_course() (last changed in drizzle/0045_offering_id_not_null.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_default_offering_for_course(p_course uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT o.id
  FROM course_offerings o
  WHERE o.course_id = p_course
  ORDER BY (o.term_label = 'default') DESC, o.created_at ASC
  LIMIT 1
$$;
