-- Live definition of sol_fill_offering_from_course() (last changed in drizzle/0045_offering_id_not_null.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_fill_offering_from_course() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.offering_id IS NULL AND NEW.course_id IS NOT NULL THEN
    NEW.offering_id := sol_default_offering_for_course(NEW.course_id);
  END IF;
  RETURN NEW;
END
$$;
