-- Live definition of sol_chatbot_section_ids() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_chatbot_section_ids(p_chatbot_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_ids uuid[];
BEGIN
  IF p_chatbot_id IS NULL THEN RETURN ARRAY[]::uuid[]; END IF;
  SELECT tenant_id INTO v_tenant FROM chatbots WHERE id = p_chatbot_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  SELECT COALESCE(array_agg(section_id), ARRAY[]::uuid[])
  INTO v_ids FROM chatbot_sections WHERE chatbot_id = p_chatbot_id;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION sol_chatbot_section_ids(uuid) FROM PUBLIC;
