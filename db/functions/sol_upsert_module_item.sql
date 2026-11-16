-- Live definition of sol_upsert_module_item() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_module_item(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id', '')::uuid;
  v_module uuid := (p_payload->>'moduleId')::uuid;
  v_tenant uuid;
  v_row module_items%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM course_modules WHERE id = v_module AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'module_not_found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  IF v_id IS NULL THEN
    INSERT INTO module_items (
      module_id, tenant_id, position, title, is_header, type,
      lesson_id, quiz_id, chatbot_id, interactive_id, page_id, peer_discussion_id,
      material_id, external_url, completion_requirement, published
    ) VALUES (
      v_module,
      v_tenant,
      coalesce((p_payload->>'position')::int, 0),
      coalesce(p_payload->>'title', 'Item'),
      coalesce((p_payload->>'isHeader')::boolean, false),
      coalesce(p_payload->>'type', 'HEADER'),
      NULLIF(p_payload->>'lessonId', '')::uuid,
      NULLIF(p_payload->>'quizId', '')::uuid,
      NULLIF(p_payload->>'chatbotId', '')::uuid,
      NULLIF(p_payload->>'interactiveId', '')::uuid,
      NULLIF(p_payload->>'pageId', '')::uuid,
      NULLIF(p_payload->>'peerDiscussionId', '')::uuid,
      NULLIF(p_payload->>'materialId', '')::uuid,
      NULLIF(p_payload->>'externalUrl', ''),
      p_payload->'completionRequirement',
      coalesce((p_payload->>'published')::boolean, true)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE module_items SET
      title = coalesce(p_payload->>'title', title),
      position = coalesce((p_payload->>'position')::int, position),
      is_header = coalesce((p_payload->>'isHeader')::boolean, is_header),
      type = coalesce(p_payload->>'type', type),
      completion_requirement = CASE WHEN p_payload ? 'completionRequirement'
        THEN p_payload->'completionRequirement' ELSE completion_requirement END,
      published = coalesce((p_payload->>'published')::boolean, published),
      updated_at = now()
    WHERE id = v_id AND module_id = v_module AND deleted_at IS NULL
    RETURNING * INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
