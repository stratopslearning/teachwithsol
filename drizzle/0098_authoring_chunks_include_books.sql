-- Authoring DEFINER chunks must include legacy course_material_chunks (books).
-- New function name: sol_course_authoring_chunks is owned by neondb_owner and
-- cannot be REPLACE'd by sol_migrator after ALTER OWNER.

--> statement-breakpoint
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

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_course_material_chunk_count(p_material_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_count int;
BEGIN
  IF p_material_id IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(m.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM course_materials m
  JOIN courses c ON c.id = m.course_id
  WHERE m.id = p_material_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  SELECT count(*)::int INTO v_count
  FROM course_material_chunks
  WHERE material_id = p_material_id AND deleted_at IS NULL;
  RETURN COALESCE(v_count, 0);
END;
$$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_course_authoring_chunks_v2(uuid, integer, uuid[]) FROM PUBLIC;

--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_course_material_chunk_count(uuid) FROM PUBLIC;

--> statement-breakpoint
DO $$
DECLARE
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_course_authoring_chunks_v2(uuid, integer, uuid[]) TO sol_app;
    GRANT EXECUTE ON FUNCTION sol_course_material_chunk_count(uuid) TO sol_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    FOR r IN
      SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'sol_course_authoring_chunks_v2',
          'sol_course_material_chunk_count'
        )
    LOOP
      EXECUTE format('ALTER FUNCTION %s OWNER TO neondb_owner', r.sig);
    END LOOP;
  END IF;
END
$$;
