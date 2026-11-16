-- Live definition of sol_section_ids_for_offerings() (last changed in drizzle/0052_entity_resolve_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_section_ids_for_offerings(p_offering_ids uuid[])
RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT s.id
  FROM sections s
  WHERE s.offering_id = ANY (p_offering_ids)
    AND s.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_section_ids_for_offerings(uuid[]) FROM PUBLIC;
