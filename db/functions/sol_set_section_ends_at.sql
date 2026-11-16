-- Live definition of sol_set_section_ends_at() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_section_ends_at(
  p_section_id uuid,
  p_ends_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_id uuid;
  v_ends timestamptz;
BEGIN
  SELECT COALESCE(s.tenant_id, s.workspace_id) INTO v_tenant
  FROM sections s
  WHERE s.id = p_section_id AND s.deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Section not found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE sections
  SET ends_at = p_ends_at, updated_at = now()
  WHERE id = p_section_id
  RETURNING id, ends_at INTO v_id, v_ends;

  RETURN jsonb_build_object('id', v_id, 'endsAt', v_ends);
END;
$$;
REVOKE ALL ON FUNCTION sol_set_section_ends_at(uuid, timestamptz) FROM PUBLIC;
