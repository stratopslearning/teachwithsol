-- Live definition of sol_bootstrap_workspace() (last changed in drizzle/0047_workspace_bootstrap.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_bootstrap_workspace(
  p_id uuid,
  p_slug text,
  p_name text,
  p_type text,
  p_status text,
  p_parent_workspace_id uuid,
  p_settings jsonb,
  p_owner_user_id uuid,
  p_plan text,
  p_seat_cap integer,
  p_ai_unit_cap integer,
  p_billing_provider text,
  p_license_status text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO workspaces (
    id, slug, name, type, status, parent_workspace_id, settings
  ) VALUES (
    p_id,
    p_slug,
    p_name,
    p_type,
    p_status,
    p_parent_workspace_id,
    COALESCE(p_settings, '{}'::jsonb)
  );

  INSERT INTO workspace_licenses (
    workspace_id, plan, seat_cap, ai_unit_cap, billing_provider, status
  ) VALUES (
    p_id,
    p_plan,
    p_seat_cap,
    p_ai_unit_cap,
    p_billing_provider,
    p_license_status
  );

  IF p_owner_user_id IS NOT NULL THEN
    INSERT INTO workspace_memberships (workspace_id, user_id, role, status)
    VALUES (p_id, p_owner_user_id, 'member', 'active');

    INSERT INTO role_bindings (
      tenant_id, user_id, scope_type, scope_id, role, granted_by
    ) VALUES (
      p_id, p_owner_user_id, 'organization', p_id, 'owner', p_owner_user_id
    );
  END IF;

  INSERT INTO authoring_policies (
    workspace_id,
    tenant_id,
    structure_notes,
    rubric_style,
    tone
  ) VALUES (
    p_id,
    p_id,
    'Weekly modules with clear learning objectives; one summative assessment per major topic.',
    'Criteria-based rubric with 4 performance levels.',
    'Clear, inclusive, undergraduate-appropriate.'
  );

  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_bootstrap_workspace(
  uuid, text, text, text, text, uuid, jsonb, uuid, text, integer, integer, text, text
) FROM PUBLIC;
