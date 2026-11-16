-- Live definition of sol_outline_item_by_id() (last changed in drizzle/0059_course_authoring_chunks.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_outline_item_by_id(p_item_id uuid)
RETURNS TABLE (
  id uuid,
  module_id uuid,
  outline_id uuid,
  course_id uuid,
  tenant_id uuid,
  type text,
  title text,
  status text,
  deleted_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    i.id,
    i.module_id,
    m.outline_id,
    o.course_id,
    COALESCE(i.tenant_id, m.tenant_id, o.tenant_id) AS tenant_id,
    i.type::text,
    i.title,
    i.status::text,
    i.deleted_at
  FROM outline_items i
  JOIN outline_modules m ON m.id = i.module_id
  JOIN course_outlines o ON o.id = m.outline_id
  WHERE i.id = p_item_id
    AND i.deleted_at IS NULL
    AND m.deleted_at IS NULL
    AND o.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_outline_item_by_id(uuid) FROM PUBLIC;
