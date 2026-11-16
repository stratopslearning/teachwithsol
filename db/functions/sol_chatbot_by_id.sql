-- Live definition of sol_chatbot_by_id() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_chatbot_by_id(p_chatbot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row chatbots%ROWTYPE;
BEGIN
  IF p_chatbot_id IS NULL THEN RETURN NULL; END IF;
  SELECT tenant_id INTO v_tenant FROM chatbots WHERE id = p_chatbot_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  SELECT * INTO v_row
  FROM chatbots
  WHERE id = p_chatbot_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_chatbot_by_id(uuid) FROM PUBLIC;
