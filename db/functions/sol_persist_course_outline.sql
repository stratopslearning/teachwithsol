-- Live definition of sol_persist_course_outline() (last changed in drizzle/0063_outline_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_persist_course_outline(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_user uuid := (p_payload->>'createdByUserId')::uuid;
  v_outline uuid;
  v_module jsonb;
  v_module_id uuid;
  v_item jsonb;
  v_mi int := 0;
  v_ii int;
  v_user_msg text := COALESCE(NULLIF(trim(p_payload->>'userMessage'), ''), 'Propose an outline');
  v_asst_msg text := COALESCE(NULLIF(trim(p_payload->>'assistantMessage'), ''), 'Outline ready');
BEGIN
  IF v_tenant IS NULL OR v_course IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'tenantId, courseId, createdByUserId required';
  END IF;

  UPDATE course_outlines
  SET status = 'ARCHIVED', updated_at = now()
  WHERE course_id = v_course
    AND deleted_at IS NULL
    AND status <> 'ARCHIVED';

  INSERT INTO course_outlines (
    course_id, tenant_id, created_by_user_id, title, status, brief,
    has_prior_corpus, bodies_built
  ) VALUES (
    v_course,
    v_tenant,
    v_user,
    COALESCE(p_payload->>'title', 'Course outline'),
    COALESCE(p_payload->>'status', 'DRAFT'),
    NULLIF(p_payload->>'brief', ''),
    COALESCE((p_payload->>'hasPriorCorpus')::boolean, false),
    COALESCE((p_payload->>'bodiesBuilt')::boolean, false)
  )
  RETURNING id INTO v_outline;

  FOR v_module IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'modules', '[]'::jsonb))
  LOOP
    INSERT INTO outline_modules (outline_id, tenant_id, title, summary, position)
    VALUES (
      v_outline,
      v_tenant,
      COALESCE(v_module->>'title', 'Module'),
      NULLIF(v_module->>'summary', ''),
      v_mi
    )
    RETURNING id INTO v_module_id;

    v_ii := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_module->'items', '[]'::jsonb))
    LOOP
      INSERT INTO outline_items (
        module_id, tenant_id, type, title, status, body, source_material_ids, position
      ) VALUES (
        v_module_id,
        v_tenant,
        COALESCE(v_item->>'type', 'QUIZ'),
        COALESCE(v_item->>'title', 'Item'),
        'DRAFT',
        COALESCE(v_item->'body', '{}'::jsonb),
        COALESCE(v_item->'sourceMaterialIds', '[]'::jsonb),
        v_ii
      );
      v_ii := v_ii + 1;
    END LOOP;
    v_mi := v_mi + 1;
  END LOOP;

  INSERT INTO authoring_messages (outline_id, tenant_id, role, content) VALUES
    (v_outline, v_tenant, 'user', v_user_msg),
    (v_outline, v_tenant, 'assistant', v_asst_msg);

  RETURN v_outline;
END;
$$;
REVOKE ALL ON FUNCTION sol_persist_course_outline(jsonb) FROM PUBLIC;
