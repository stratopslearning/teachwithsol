-- Live definition of sol_insert_authoring_messages() (last changed in drizzle/0062_authoring_rls_writes.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_insert_authoring_messages(
  p_outline_id uuid,
  p_tenant_id uuid,
  p_messages jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg jsonb;
BEGIN
  IF p_outline_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'outlineId and tenantId required';
  END IF;

  FOR v_msg IN SELECT * FROM jsonb_array_elements(COALESCE(p_messages, '[]'::jsonb))
  LOOP
    INSERT INTO authoring_messages (outline_id, tenant_id, role, content)
    VALUES (
      p_outline_id,
      p_tenant_id,
      COALESCE(NULLIF(v_msg->>'role', ''), 'assistant'),
      COALESCE(v_msg->>'content', '')
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION sol_insert_authoring_messages(uuid, uuid, jsonb) FROM PUBLIC;
