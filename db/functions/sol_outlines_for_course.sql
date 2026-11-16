-- Live definition of sol_outlines_for_course() (last changed in drizzle/0059_course_authoring_chunks.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_outlines_for_course(
  p_course_id uuid,
  p_include_archived boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  course_id uuid,
  tenant_id uuid,
  title text,
  status text,
  brief text,
  has_prior_corpus boolean,
  bodies_built boolean,
  preview text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    o.id,
    o.course_id,
    o.tenant_id,
    o.title,
    o.status::text,
    o.brief,
    o.has_prior_corpus,
    o.bodies_built,
    COALESCE(
      (
        SELECT left(m.content, 120)
        FROM authoring_messages m
        WHERE m.outline_id = o.id AND m.role = 'user'
        ORDER BY m.created_at ASC
        LIMIT 1
      ),
      NULLIF(left(trim(COALESCE(o.brief, '')), 120), '')
    ) AS preview,
    o.created_at,
    o.updated_at
  FROM course_outlines o
  WHERE o.course_id = p_course_id
    AND o.deleted_at IS NULL
    AND (p_include_archived OR o.status <> 'ARCHIVED')
  ORDER BY o.updated_at DESC;
$$;
REVOKE ALL ON FUNCTION sol_outlines_for_course(uuid, boolean) FROM PUBLIC;
