-- Live definition of sol_assign_chatbot_sections() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_assign_chatbot_sections(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := (p_payload->>'chatbotId')::uuid;
  v_assigned_by uuid := (p_payload->>'assignedBy')::uuid;
  v_tenant uuid;
  v_section uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM chatbots WHERE id = v_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discussion not found';
  END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  FOR v_section IN
    SELECT (jsonb_array_elements_text(COALESCE(p_payload->'sectionIds', '[]'::jsonb)))::uuid
  LOOP
    INSERT INTO chatbot_sections (chatbot_id, section_id, assigned_by, tenant_id)
    VALUES (v_id, v_section, v_assigned_by, v_tenant)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_assign_chatbot_sections(jsonb) FROM PUBLIC;
