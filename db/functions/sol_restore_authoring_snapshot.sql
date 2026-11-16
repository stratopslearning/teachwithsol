-- Live definition of sol_restore_authoring_snapshot() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_restore_authoring_snapshot(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outline uuid := (p_payload->>'outlineId')::uuid;
  v_tenant uuid;
  v_snap jsonb := p_payload->'snapshot';
  v_mod jsonb;
  v_item jsonb;
BEGIN
  IF v_outline IS NULL OR v_snap IS NULL THEN
    RAISE EXCEPTION 'outlineId and snapshot required';
  END IF;
  SELECT COALESCE(tenant_id, workspace_id) INTO v_tenant
  FROM course_outlines WHERE id = v_outline AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Outline not found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  FOR v_mod IN SELECT * FROM jsonb_array_elements(COALESCE(v_snap->'modules', '[]'::jsonb))
  LOOP
    UPDATE outline_modules SET
      title = COALESCE(v_mod->>'title', title),
      summary = CASE WHEN v_mod ? 'summary' THEN NULLIF(v_mod->>'summary', '') ELSE summary END,
      position = COALESCE((v_mod->>'position')::integer, position),
      updated_at = now()
    WHERE id = (v_mod->>'id')::uuid AND outline_id = v_outline;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_mod->'items', '[]'::jsonb))
    LOOP
      UPDATE outline_items SET
        title = COALESCE(v_item->>'title', title),
        type = COALESCE(v_item->>'type', type),
        status = COALESCE(v_item->>'status', status),
        position = COALESCE((v_item->>'position')::integer, position),
        body = COALESCE(v_item->'body', body),
        faithful_body = CASE WHEN v_item ? 'faithfulBody' THEN v_item->'faithfulBody' ELSE faithful_body END,
        variant_of_item_id = CASE
          WHEN v_item ? 'variantOfItemId' THEN NULLIF(v_item->>'variantOfItemId', '')::uuid
          ELSE variant_of_item_id
        END,
        updated_at = now()
      WHERE id = (v_item->>'id')::uuid AND deleted_at IS NULL;
    END LOOP;
  END LOOP;

  UPDATE course_outlines SET
    title = COALESCE(NULLIF(v_snap->>'title', ''), title),
    status = COALESCE(NULLIF(v_snap->>'status', ''), status),
    bodies_built = COALESCE((v_snap->>'bodiesBuilt')::boolean, bodies_built),
    has_prior_corpus = COALESCE((v_snap->>'hasPriorCorpus')::boolean, has_prior_corpus),
    updated_at = now()
  WHERE id = v_outline;
END;
$$;
REVOKE ALL ON FUNCTION sol_restore_authoring_snapshot(jsonb) FROM PUBLIC;
