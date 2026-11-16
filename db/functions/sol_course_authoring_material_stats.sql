-- Live definition of sol_course_authoring_material_stats() (last changed in drizzle/0056_course_knowledge_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_course_authoring_material_stats(p_course_id uuid)
RETURNS TABLE (
  ready_count integer,
  prior_tagged_count integer,
  this_term_tagged_count integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH ready_materials AS (
    SELECT m.authoring_corpus
    FROM course_materials m
    WHERE m.course_id = p_course_id
      AND m.deleted_at IS NULL
      AND m.status = 'READY'
  ),
  links AS (
    SELECT ckl.authoring_corpus
    FROM course_knowledge_links ckl
    WHERE ckl.course_id = p_course_id
  )
  SELECT
    (SELECT count(*)::int FROM ready_materials) AS ready_count,
    (
      (SELECT count(*)::int FROM ready_materials WHERE authoring_corpus = 'prior_course')
      + (SELECT count(*)::int FROM links WHERE authoring_corpus = 'prior_course')
    ) AS prior_tagged_count,
    (
      (SELECT count(*)::int FROM ready_materials WHERE authoring_corpus IS DISTINCT FROM 'prior_course')
      + (SELECT count(*)::int FROM links WHERE authoring_corpus IS DISTINCT FROM 'prior_course')
    ) AS this_term_tagged_count;
$$;
REVOKE ALL ON FUNCTION sol_course_authoring_material_stats(uuid) FROM PUBLIC;
