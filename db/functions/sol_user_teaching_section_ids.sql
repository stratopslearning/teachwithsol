-- Live definition of sol_user_teaching_section_ids() (last changed in drizzle/0073_student_exam_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_user_teaching_section_ids(p_user_id uuid)
RETURNS TABLE (section_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH b AS (
    SELECT role::text AS role, scope_type::text AS scope_type, scope_id, tenant_id
    FROM role_bindings
    WHERE user_id = p_user_id AND revoked_at IS NULL
  ),
  from_section AS (
    SELECT b.scope_id AS section_id
    FROM b
    WHERE b.scope_type = 'section'
      AND b.role IN ('ta', 'grader', 'lead_instructor', 'co_instructor', 'faculty', 'owner', 'admin')
  ),
  from_offering AS (
    SELECT s.id AS section_id
    FROM b
    JOIN sections s ON s.offering_id = b.scope_id AND s.deleted_at IS NULL
    WHERE b.scope_type = 'offering'
      AND b.role IN (
        'lead_instructor', 'co_instructor', 'faculty', 'owner', 'admin', 'ta', 'grader'
      )
  ),
  from_org AS (
    SELECT s.id AS section_id
    FROM b
    JOIN courses c ON c.workspace_id = b.tenant_id AND c.deleted_at IS NULL
    JOIN sections s ON s.course_id = c.id AND s.deleted_at IS NULL
    WHERE b.scope_type IN ('organization', 'department')
      AND b.role IN (
        'owner', 'admin', 'faculty', 'lead_instructor', 'co_instructor', 'ta', 'grader'
      )
  )
  SELECT DISTINCT section_id FROM (
    SELECT section_id FROM from_section
    UNION ALL
    SELECT section_id FROM from_offering
    UNION ALL
    SELECT section_id FROM from_org
  ) x
  WHERE section_id IS NOT NULL;
$$;
