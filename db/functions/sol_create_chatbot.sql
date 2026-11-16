-- Live definition of sol_create_chatbot() (last changed in drizzle/0106_publish_activity_chatbot_rls.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_chatbot(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_professor uuid := (p_payload->>'professorId')::uuid;
  v_section_ids uuid[] := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'sectionIds', '[]'::jsonb))::uuid),
    ARRAY[]::uuid[]
  );
  v_hint uuid := NULLIF(p_payload->>'tenantId', '')::uuid;
  v_tenant uuid;
  v_offering uuid;
  v_id uuid;
  v_title text;
BEGIN
  IF v_hint IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_hint::text, true);
    v_tenant := v_hint;
  ELSE
    PERFORM set_config('app.tenant_id', '', true);
  END IF;

  IF array_length(v_section_ids, 1) IS NOT NULL THEN
    SELECT COALESCE(s.tenant_id, s.workspace_id), s.offering_id
    INTO v_tenant, v_offering
    FROM sections s WHERE s.id = v_section_ids[1] AND s.deleted_at IS NULL;
  END IF;
  v_tenant := COALESCE(v_hint, v_tenant);
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  INSERT INTO chatbots (
    professor_id, tenant_id, offering_id, title, description, persona_name,
    instructions, system_prompt, related_quiz_id, is_template, model, is_active
  ) VALUES (
    v_professor,
    v_tenant,
    v_offering,
    COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled discussion'),
    NULLIF(p_payload->>'description', ''),
    COALESCE(NULLIF(trim(p_payload->>'personaName'), ''), 'Professor Emma'),
    COALESCE(p_payload->>'instructions', ''),
    COALESCE(p_payload->>'systemPrompt', ''),
    NULLIF(p_payload->>'relatedQuizId', '')::uuid,
    false,
    COALESCE(NULLIF(p_payload->>'model', ''), 'gpt-4.1-mini'),
    COALESCE((p_payload->>'isActive')::boolean, true)
  )
  RETURNING id, title INTO v_id, v_title;

  IF array_length(v_section_ids, 1) IS NOT NULL THEN
    INSERT INTO chatbot_sections (chatbot_id, section_id, assigned_by, tenant_id)
    SELECT v_id, sid, v_professor, v_tenant
    FROM unnest(v_section_ids) AS sid;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'title', v_title);
END;
$$;
REVOKE ALL ON FUNCTION sol_create_chatbot(jsonb) FROM PUBLIC;
