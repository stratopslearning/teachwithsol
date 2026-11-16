-- Live definition of sol_duplicate_chatbot() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_duplicate_chatbot(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source uuid := (p_payload->>'sourceChatbotId')::uuid;
  v_professor uuid := (p_payload->>'professorId')::uuid;
  v_src chatbots%ROWTYPE;
  v_new uuid;
  v_title text;
BEGIN
  SELECT * INTO v_src FROM chatbots WHERE id = v_source AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discussion not found';
  END IF;
  IF v_src.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_src.tenant_id::text, true);
  END IF;

  v_title := CASE
    WHEN v_src.is_template THEN v_src.title
    ELSE v_src.title || ' (copy)'
  END;

  INSERT INTO chatbots (
    professor_id, tenant_id, offering_id, title, description, persona_name,
    instructions, system_prompt, related_quiz_id, is_template, model, is_active
  ) VALUES (
    v_professor, v_src.tenant_id, v_src.offering_id, v_title, v_src.description,
    v_src.persona_name, v_src.instructions, v_src.system_prompt, v_src.related_quiz_id,
    false, v_src.model, true
  )
  RETURNING id INTO v_new;

  RETURN jsonb_build_object('id', v_new, 'title', v_title);
END;
$$;
REVOKE ALL ON FUNCTION sol_duplicate_chatbot(jsonb) FROM PUBLIC;
