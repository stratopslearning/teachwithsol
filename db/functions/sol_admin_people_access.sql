-- Live definition of sol_admin_people_access() (last changed in drizzle/0048_admin_people_access.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_people_access()
RETURNS TABLE (
  user_id uuid,
  kind text,
  role text,
  scope_type text,
  scope_id uuid,
  tenant_id uuid,
  tenant_name text,
  scope_label text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    b.user_id,
    'binding'::text AS kind,
    b.role::text,
    b.scope_type::text,
    b.scope_id,
    b.tenant_id,
    w.name::text AS tenant_name,
    CASE b.scope_type
      WHEN 'organization' THEN w.name::text
      WHEN 'department' THEN COALESCE(dw.name, w.name)::text
      WHEN 'offering' THEN COALESCE(
        NULLIF(o.term_label, ''),
        b.scope_id::text
      )
      WHEN 'section' THEN COALESCE(s.name, b.scope_id::text)
      ELSE b.scope_id::text
    END AS scope_label
  FROM role_bindings b
  JOIN workspaces w ON w.id = b.tenant_id
  LEFT JOIN workspaces dw
    ON dw.id = b.scope_id AND b.scope_type = 'department'
  LEFT JOIN course_offerings o
    ON o.id = b.scope_id AND b.scope_type = 'offering'
  LEFT JOIN sections s
    ON s.id = b.scope_id AND b.scope_type = 'section'
  WHERE b.revoked_at IS NULL

  UNION ALL

  SELECT
    ss.student_id AS user_id,
    'student'::text AS kind,
    'student'::text AS role,
    'section'::text AS scope_type,
    ss.section_id AS scope_id,
    COALESCE(s.tenant_id, s.workspace_id) AS tenant_id,
    w.name::text AS tenant_name,
    COALESCE(s.name, ss.section_id::text) AS scope_label
  FROM student_sections ss
  JOIN sections s ON s.id = ss.section_id
  LEFT JOIN workspaces w
    ON w.id = COALESCE(s.tenant_id, s.workspace_id)
  WHERE ss.status = 'ACTIVE';
$$;
REVOKE ALL ON FUNCTION sol_admin_people_access() FROM PUBLIC;
