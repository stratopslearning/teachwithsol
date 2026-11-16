-- Live definition of sol_course_hub_meta() (last changed in drizzle/0055_course_hub_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_course_hub_meta(p_course_id uuid)
RETURNS TABLE (
  description text,
  ai_policy jsonb,
  section_count integer,
  material_count integer,
  ready_count integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    c.description,
    c.ai_policy,
    (
      SELECT count(*)::int FROM sections s
      WHERE s.course_id = c.id AND s.deleted_at IS NULL
    ) AS section_count,
    -- Hub stats: all materials (including those mirrored into Knowledge).
    (
      SELECT count(*)::int FROM course_materials m
      WHERE m.course_id = c.id AND m.deleted_at IS NULL
    ) AS material_count,
    (
      SELECT count(*)::int FROM course_materials m
      WHERE m.course_id = c.id
        AND m.deleted_at IS NULL
        AND m.status = 'READY'
    ) AS ready_count
  FROM courses c
  WHERE c.id = p_course_id AND c.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_course_hub_meta(uuid) FROM PUBLIC;
