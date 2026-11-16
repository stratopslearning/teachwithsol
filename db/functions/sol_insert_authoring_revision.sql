-- Live definition of sol_insert_authoring_revision() (last changed in drizzle/0063_outline_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_insert_authoring_revision(
  p_outline_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_label text,
  p_snapshot jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_tenant uuid := COALESCE(
    p_tenant_id,
    (SELECT tenant_id FROM course_outlines WHERE id = p_outline_id)
  );
BEGIN
  INSERT INTO authoring_revisions (outline_id, tenant_id, created_by_user_id, label, snapshot)
  VALUES (p_outline_id, v_tenant, p_user_id, left(p_label, 200), p_snapshot)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_insert_authoring_revision(uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
