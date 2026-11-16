-- Live definition of sol_backfill_modules_from_outline() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_backfill_modules_from_outline(p_outline_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_course uuid;
  v_tenant uuid;
  v_omod record;
  v_omodule uuid;
  v_item record;
  v_created int := 0;
BEGIN
  SELECT course_id, tenant_id INTO v_course, v_tenant
  FROM course_outlines WHERE id = p_outline_id AND deleted_at IS NULL;
  IF v_course IS NULL THEN RAISE EXCEPTION 'outline_not_found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  FOR v_omod IN
    SELECT * FROM outline_modules
    WHERE outline_id = p_outline_id AND deleted_at IS NULL
    ORDER BY position
  LOOP
    INSERT INTO course_modules (course_id, tenant_id, title, position, published)
    VALUES (v_course, v_tenant, v_omod.title, v_omod.position, false)
    RETURNING id INTO v_omodule;
    v_created := v_created + 1;

    FOR v_item IN
      SELECT * FROM outline_items
      WHERE module_id = v_omod.id AND deleted_at IS NULL
      ORDER BY position
    LOOP
      INSERT INTO module_items (
        module_id, tenant_id, position, title, is_header, type,
        lesson_id, quiz_id, chatbot_id, interactive_id, published
      ) VALUES (
        v_omodule, v_tenant, v_item.position, v_item.title, false,
        CASE v_item.type
          WHEN 'DISCUSSION' THEN 'TUTOR'
          ELSE v_item.type
        END,
        v_item.published_lesson_id,
        v_item.published_quiz_id,
        v_item.published_chatbot_id,
        v_item.published_interactive_id,
        false
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('modulesCreated', v_created, 'courseId', v_course);
END;
$$;
