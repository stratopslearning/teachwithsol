-- Live definition of sol_outline_by_id() (last changed in drizzle/0059_course_authoring_chunks.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_outline_by_id(p_outline_id uuid)
RETURNS TABLE (
  id uuid,
  course_id uuid,
  tenant_id uuid,
  created_by_user_id uuid,
  title text,
  status text,
  brief text,
  has_prior_corpus boolean,
  bodies_built boolean,
  deleted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    o.id,
    o.course_id,
    o.tenant_id,
    o.created_by_user_id,
    o.title,
    o.status::text,
    o.brief,
    o.has_prior_corpus,
    o.bodies_built,
    o.deleted_at,
    o.created_at,
    o.updated_at
  FROM course_outlines o
  WHERE o.id = p_outline_id
    AND o.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_outline_by_id(uuid) FROM PUBLIC;
