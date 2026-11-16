-- Live definition of sol_fill_offering_from_section() (last changed in drizzle/0045_offering_id_not_null.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_fill_offering_from_section() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.offering_id IS NULL AND NEW.section_id IS NOT NULL THEN
    SELECT s.offering_id INTO NEW.offering_id FROM sections s WHERE s.id = NEW.section_id;
  END IF;
  RETURN NEW;
END
$$;
