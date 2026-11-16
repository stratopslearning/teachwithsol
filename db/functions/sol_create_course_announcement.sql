-- Live definition of sol_create_course_announcement() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_course_announcement(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_tenant uuid;
  v_row course_announcements%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM courses WHERE id = v_course AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'course_not_found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  INSERT INTO course_announcements (
    course_id, tenant_id, author_user_id, title, body_markdown, published_at
  ) VALUES (
    v_course, v_tenant,
    (p_payload->>'authorUserId')::uuid,
    coalesce(p_payload->>'title', 'Announcement'),
    coalesce(p_payload->>'bodyMarkdown', ''),
    CASE WHEN coalesce((p_payload->>'publish')::boolean, true)
      THEN now() ELSE NULL END
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;
