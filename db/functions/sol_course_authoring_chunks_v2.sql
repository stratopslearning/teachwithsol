-- Live definition of sol_course_authoring_chunks_v2() (last changed in drizzle/0098_authoring_chunks_include_books.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_course_authoring_chunks_v2(
  p_course_id uuid,
  p_limit integer DEFAULT 24,
  p_focus_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  material_id uuid,
  content text,
  title text,
  origin text,
  version_id uuid
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH focus AS (
    SELECT DISTINCT x AS id
    FROM unnest(COALESCE(p_focus_ids, ARRAY[]::uuid[])) AS x
  ),
  expanded AS (
    SELECT id FROM focus
    UNION
    SELECT kd.id
    FROM knowledge_documents kd
    WHERE kd.deleted_at IS NULL
      AND kd.legacy_material_id IN (SELECT id FROM focus)
    UNION
    SELECT kd.legacy_material_id
    FROM knowledge_documents kd
    WHERE kd.deleted_at IS NULL
      AND kd.legacy_material_id IS NOT NULL
      AND kd.id IN (SELECT id FROM focus)
  ),
  use_focus AS (
    SELECT EXISTS (SELECT 1 FROM focus) AS active
  ),
  linked AS (
    SELECT
      kc.id,
      kc.document_id AS material_id,
      left(kc.content, 4000) AS content,
      kd.title,
      'shared'::text AS origin,
      kc.version_id,
      kd.title AS sort_title
    FROM knowledge_chunks kc
    INNER JOIN course_knowledge_links ckl
      ON ckl.document_id = kc.document_id
     AND ckl.pinned_version_id = kc.version_id
    INNER JOIN knowledge_documents kd
      ON kd.id = kc.document_id
     AND kd.deleted_at IS NULL
    WHERE ckl.course_id = p_course_id
      AND kc.deleted_at IS NULL
      AND kc.superseded_at IS NULL
      AND kc.content IS NOT NULL
      AND (
        NOT (SELECT active FROM use_focus)
        OR kc.document_id IN (SELECT id FROM expanded)
      )
  ),
  legacy AS (
    SELECT
      cmc.id,
      cmc.material_id,
      left(cmc.content, 4000) AS content,
      cm.title,
      'course'::text AS origin,
      NULL::uuid AS version_id,
      cm.title AS sort_title
    FROM course_material_chunks cmc
    INNER JOIN course_materials cm
      ON cm.id = cmc.material_id
     AND cm.deleted_at IS NULL
    WHERE cmc.course_id = p_course_id
      AND cmc.deleted_at IS NULL
      AND cmc.content IS NOT NULL
      AND (
        NOT (SELECT active FROM use_focus)
        OR cmc.material_id IN (SELECT id FROM expanded)
      )
  )
  SELECT id, material_id, content, title, origin, version_id
  FROM (
    SELECT * FROM linked
    UNION ALL
    SELECT * FROM legacy
  ) x
  ORDER BY sort_title ASC, id ASC
  LIMIT GREATEST(COALESCE(p_limit, 24), 1);
$$;
REVOKE ALL ON FUNCTION sol_course_authoring_chunks_v2(uuid, integer, uuid[]) FROM PUBLIC;
