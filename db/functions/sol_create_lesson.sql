-- Live definition of sol_create_lesson() (last changed in drizzle/0105_publish_lesson_interactive_rls.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_lesson(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_professor uuid := (p_payload->>'professorId')::uuid;
  v_hint uuid := NULLIF(p_payload->>'tenantId', '')::uuid;
  v_tenant uuid;
  v_offering uuid;
  v_id uuid;
  v_card jsonb;
  v_pos int := 0;
BEGIN
  IF v_course IS NULL OR v_professor IS NULL THEN
    RAISE EXCEPTION 'courseId and professorId required';
  END IF;

  IF v_hint IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_hint::text, true);
  ELSE
    PERFORM set_config('app.tenant_id', '', true);
  END IF;

  SELECT COALESCE(c.tenant_id, c.workspace_id),
         sol_default_offering_for_course(c.id)
  INTO v_tenant, v_offering
  FROM courses c WHERE c.id = v_course AND c.deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Course not found'; END IF;
  v_tenant := COALESCE(v_hint, v_tenant);
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  INSERT INTO lessons (
    professor_id, course_id, tenant_id, offering_id, title, markdown, chapter,
    is_active, source_outline_item_id
  ) VALUES (
    v_professor, v_course, v_tenant, v_offering,
    COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled lesson'),
    COALESCE(p_payload->>'markdown', ''),
    CASE
      WHEN p_payload ? 'chapter' AND p_payload->'chapter' IS NOT NULL
           AND jsonb_typeof(p_payload->'chapter') = 'object'
        THEN p_payload->'chapter'
      ELSE NULL
    END,
    COALESCE((p_payload->>'isActive')::boolean, false),
    NULLIF(p_payload->>'sourceOutlineItemId', '')::uuid
  )
  RETURNING id INTO v_id;

  FOR v_card IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'flashcards', '[]'::jsonb))
  LOOP
    IF NULLIF(trim(v_card->>'front'), '') IS NULL
       OR NULLIF(trim(v_card->>'back'), '') IS NULL THEN
      CONTINUE;
    END IF;
    INSERT INTO flashcards (lesson_id, tenant_id, front, back, position)
    VALUES (
      v_id, v_tenant,
      trim(v_card->>'front'), trim(v_card->>'back'), v_pos
    );
    v_pos := v_pos + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_id,
    'title', COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled lesson'),
    'courseId', v_course,
    'professorId', v_professor,
    'isActive', COALESCE((p_payload->>'isActive')::boolean, false),
    'sourceOutlineItemId', NULLIF(p_payload->>'sourceOutlineItemId', '')::uuid
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_create_lesson(jsonb) FROM PUBLIC;
