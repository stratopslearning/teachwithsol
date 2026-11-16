-- Live definition of sol_apply_outline_build() (last changed in drizzle/0063_outline_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_apply_outline_build(
  p_outline_id uuid,
  p_patches jsonb,
  p_has_prior_corpus boolean DEFAULT false,
  p_ai_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patch jsonb;
BEGIN
  FOR v_patch IN SELECT * FROM jsonb_array_elements(COALESCE(p_patches, '[]'::jsonb))
  LOOP
    UPDATE outline_items
    SET
      title = COALESCE(NULLIF(v_patch->>'title', ''), title),
      body = COALESCE(v_patch->'body', body),
      faithful_body = COALESCE(v_patch->'body', faithful_body),
      source_material_ids = COALESCE(v_patch->'sourceMaterialIds', source_material_ids),
      review_status = 'pending',
      ai_meta = COALESCE(p_ai_meta, ai_meta),
      updated_at = now()
    WHERE id = (v_patch->>'itemId')::uuid
      AND deleted_at IS NULL;
  END LOOP;

  UPDATE course_outlines
  SET
    status = 'READY',
    bodies_built = true,
    has_prior_corpus = COALESCE(p_has_prior_corpus, has_prior_corpus),
    updated_at = now()
  WHERE id = p_outline_id
    AND deleted_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION sol_apply_outline_build(uuid, jsonb, boolean, jsonb) FROM PUBLIC;
