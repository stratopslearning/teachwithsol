-- Live definition of sol_upsert_peer_discussion() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_peer_discussion(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id', '')::uuid;
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_tenant uuid;
  v_row peer_discussions%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM courses WHERE id = v_course AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'course_not_found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  IF v_id IS NULL THEN
    INSERT INTO peer_discussions (
      course_id, tenant_id, created_by_user_id, title, prompt_markdown, published
    ) VALUES (
      v_course, v_tenant,
      (p_payload->>'createdByUserId')::uuid,
      coalesce(p_payload->>'title', 'Discussion'),
      coalesce(p_payload->>'promptMarkdown', ''),
      coalesce((p_payload->>'published')::boolean, false)
    ) RETURNING * INTO v_row;
  ELSE
    UPDATE peer_discussions SET
      title = coalesce(p_payload->>'title', title),
      prompt_markdown = coalesce(p_payload->>'promptMarkdown', prompt_markdown),
      published = coalesce((p_payload->>'published')::boolean, published),
      updated_at = now()
    WHERE id = v_id AND course_id = v_course AND deleted_at IS NULL
    RETURNING * INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
