-- Publish LESSON / INTERACTIVE failed under FORCE RLS: sol_create_lesson and
-- sol_create_interactive (owned by sol_migrator, no BYPASSRLS) SELECT courses
-- before app.tenant_id is set → Course not found / Failed query.
-- Mirror 0090/0103: optional tenantId hint before the course read, then
-- re-own publish helpers to neondb_owner (BYPASSRLS) like sol_create_quiz.

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

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_create_interactive(p_payload jsonb)
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
  v_row interactives%ROWTYPE;
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

  INSERT INTO interactives (
    professor_id, course_id, tenant_id, offering_id, title, description,
    kind, body, package_storage_key, is_active, source_outline_item_id
  ) VALUES (
    v_professor, v_course, v_tenant, v_offering,
    COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled interactive'),
    NULLIF(p_payload->>'description', ''),
    COALESCE(p_payload->>'kind', 'SCORM'),
    COALESCE(p_payload->'body', '{}'::jsonb),
    NULL,
    COALESCE((p_payload->>'isActive')::boolean, false),
    NULLIF(p_payload->>'sourceOutlineItemId', '')::uuid
  )
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_create_lesson(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION sol_create_interactive(jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_create_lesson(jsonb) TO sol_app;
    GRANT EXECUTE ON FUNCTION sol_create_interactive(jsonb) TO sol_app;
  END IF;
END
$$;

--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_create_lesson(jsonb) OWNER TO neondb_owner;
    ALTER FUNCTION sol_create_interactive(jsonb) OWNER TO neondb_owner;
    ALTER FUNCTION sol_assign_lesson_sections(jsonb) OWNER TO neondb_owner;
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'sol_set_interactive_sections'
    ) THEN
      ALTER FUNCTION sol_set_interactive_sections(jsonb) OWNER TO neondb_owner;
    END IF;
  END IF;
END
$$;
