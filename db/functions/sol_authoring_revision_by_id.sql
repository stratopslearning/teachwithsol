-- Live definition of sol_authoring_revision_by_id() (last changed in drizzle/0059_course_authoring_chunks.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_authoring_revision_by_id(p_revision_id uuid)
RETURNS TABLE (
  id uuid,
  outline_id uuid,
  label text,
  snapshot jsonb,
  tenant_id uuid,
  created_by_user_id uuid,
  created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    r.id,
    r.outline_id,
    r.label,
    r.snapshot,
    COALESCE(r.tenant_id, o.tenant_id) AS tenant_id,
    r.created_by_user_id,
    r.created_at
  FROM authoring_revisions r
  JOIN course_outlines o ON o.id = r.outline_id
  WHERE r.id = p_revision_id
    AND o.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_authoring_revision_by_id(uuid) FROM PUBLIC;
