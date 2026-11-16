-- Live definition of sol_set_interactive_sections() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_interactive_sections(p_payload jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interactive uuid := (p_payload->>'interactiveId')::uuid;
  v_assigned_by uuid := (p_payload->>'assignedBy')::uuid;
  v_tenant uuid;
  v_ids uuid[];
  v_bad int;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM interactives
  WHERE id = v_interactive AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Interactive not found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  SELECT count(*)::int INTO v_bad
  FROM unnest(
    COALESCE(
      ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(p_payload->'sectionIds', '[]'::jsonb)
        )::uuid
      ),
      ARRAY[]::uuid[]
    )
  ) AS sid
  LEFT JOIN sections s ON s.id = sid
  WHERE s.id IS NULL
     OR COALESCE(s.tenant_id, s.workspace_id) IS DISTINCT FROM v_tenant;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Section tenant mismatch for interactive assignment';
  END IF;

  DELETE FROM interactive_sections WHERE interactive_id = v_interactive;

  INSERT INTO interactive_sections (interactive_id, section_id, assigned_by, tenant_id)
  SELECT v_interactive, sid, v_assigned_by, v_tenant
  FROM unnest(
    COALESCE(
      ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(p_payload->'sectionIds', '[]'::jsonb)
        )::uuid
      ),
      ARRAY[]::uuid[]
    )
  ) AS sid;

  SELECT array_agg(section_id) INTO v_ids
  FROM interactive_sections WHERE interactive_id = v_interactive;
  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END;
$$;
REVOKE ALL ON FUNCTION sol_set_interactive_sections(jsonb) FROM PUBLIC;
