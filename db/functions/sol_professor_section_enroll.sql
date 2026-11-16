-- Live definition of sol_professor_section_enroll() (last changed in drizzle/0090_professor_enroll_cross_tenant.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_professor_section_enroll(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_professor uuid := (p_payload->>'professorId')::uuid;
  v_section uuid := (p_payload->>'sectionId')::uuid;
  v_hint uuid := NULLIF(p_payload->>'tenantId', '')::uuid;
  v_tenant uuid;
  v_offering uuid;
BEGIN
  IF v_professor IS NULL OR v_section IS NULL THEN
    RAISE EXCEPTION 'professorId and sectionId required';
  END IF;

  -- Prefer the destination tenant when the app already resolved it; otherwise
  -- clear the GUC so the FORCE RLS policy's empty-tenant branch can see the row.
  IF v_hint IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_hint::text, true);
  ELSE
    PERFORM set_config('app.tenant_id', '', true);
  END IF;

  SELECT COALESCE(s.tenant_id, s.workspace_id), s.offering_id
  INTO v_tenant, v_offering
  FROM sections s
  WHERE s.id = v_section AND s.deleted_at IS NULL;
  IF NOT FOUND OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'Section not found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  IF EXISTS (
    SELECT 1 FROM professor_sections
    WHERE section_id = v_section AND professor_id = v_professor
  ) THEN
    RAISE EXCEPTION 'Already enrolled in this section';
  END IF;

  INSERT INTO professor_sections (
    professor_id, section_id, tenant_id, offering_id
  ) VALUES (
    v_professor, v_section, v_tenant, v_offering
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_professor_section_enroll(jsonb) FROM PUBLIC;
