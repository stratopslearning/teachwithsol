-- Live definition of sol_clone_course_knowledge_links() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_clone_course_knowledge_links(p_payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid := (p_payload->>'fromCourseId')::uuid;
  v_to uuid := (p_payload->>'toCourseId')::uuid;
  v_linked_by uuid := NULLIF(p_payload->>'linkedByUserId', '')::uuid;
  v_to_tenant uuid;
  v_count int := 0;
  v_link course_knowledge_links%ROWTYPE;
BEGIN
  SELECT COALESCE(c.tenant_id, c.workspace_id) INTO v_to_tenant
  FROM courses c WHERE c.id = v_to AND c.deleted_at IS NULL;
  IF v_to_tenant IS NULL THEN
    RAISE EXCEPTION 'Destination course not found';
  END IF;
  PERFORM set_config('app.tenant_id', v_to_tenant::text, true);

  FOR v_link IN
    SELECT * FROM course_knowledge_links WHERE course_id = v_from
  LOOP
    IF v_link.pinned_version_id IS NULL THEN
      CONTINUE;
    END IF;
    INSERT INTO course_knowledge_links (
      course_id, document_id, linked_by_user_id, authoring_corpus,
      pinned_version_id, tenant_id, update_available_version_id,
      update_noticed_at, created_at, updated_at
    ) VALUES (
      v_to,
      v_link.document_id,
      COALESCE(v_linked_by, v_link.linked_by_user_id),
      v_link.authoring_corpus,
      v_link.pinned_version_id,
      v_to_tenant,
      NULL,
      NULL,
      now(),
      now()
    )
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION sol_clone_course_knowledge_links(jsonb) FROM PUBLIC;
