-- Live definition of sol_update_chatbot() (last changed in drizzle/0083_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_update_chatbot(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := (p_payload->>'chatbotId')::uuid;
  v_tenant uuid;
  v_assigned_by uuid := NULLIF(p_payload->>'assignedBy', '')::uuid;
  v_section_ids uuid[];
BEGIN
  SELECT tenant_id INTO v_tenant FROM chatbots WHERE id = v_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discussion not found';
  END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  UPDATE chatbots SET
    title = CASE WHEN p_payload ? 'title' THEN COALESCE(NULLIF(trim(p_payload->>'title'), ''), title) ELSE title END,
    description = CASE WHEN p_payload ? 'description' THEN NULLIF(p_payload->>'description', '') ELSE description END,
    persona_name = CASE WHEN p_payload ? 'personaName' THEN COALESCE(NULLIF(trim(p_payload->>'personaName'), ''), persona_name) ELSE persona_name END,
    instructions = CASE WHEN p_payload ? 'instructions' THEN COALESCE(p_payload->>'instructions', instructions) ELSE instructions END,
    system_prompt = CASE WHEN p_payload ? 'systemPrompt' THEN COALESCE(p_payload->>'systemPrompt', system_prompt) ELSE system_prompt END,
    related_quiz_id = CASE
      WHEN p_payload ? 'relatedQuizId' THEN NULLIF(p_payload->>'relatedQuizId', '')::uuid
      ELSE related_quiz_id
    END,
    is_active = CASE WHEN p_payload ? 'isActive' THEN (p_payload->>'isActive')::boolean ELSE is_active END,
    ai_policy = CASE
      WHEN p_payload ? 'aiPolicy' THEN p_payload->'aiPolicy'
      ELSE ai_policy
    END,
    updated_at = now()
  WHERE id = v_id;

  IF p_payload ? 'sectionIds' THEN
    v_section_ids := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'sectionIds', '[]'::jsonb))::uuid),
      ARRAY[]::uuid[]
    );
    DELETE FROM chatbot_sections WHERE chatbot_id = v_id;
    IF array_length(v_section_ids, 1) IS NOT NULL THEN
      INSERT INTO chatbot_sections (chatbot_id, section_id, assigned_by, tenant_id)
      SELECT v_id, sid, v_assigned_by, v_tenant
      FROM unnest(v_section_ids) AS sid;
    END IF;
  END IF;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_update_chatbot(jsonb) FROM PUBLIC;
