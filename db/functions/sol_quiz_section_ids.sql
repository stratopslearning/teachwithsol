-- Live definition of sol_quiz_section_ids() (last changed in drizzle/0052_entity_resolve_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_quiz_section_ids(p_quiz_id uuid)
RETURNS TABLE (section_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT qs.section_id FROM quiz_sections qs WHERE qs.quiz_id = p_quiz_id;
$$;
REVOKE ALL ON FUNCTION sol_quiz_section_ids(uuid) FROM PUBLIC;
