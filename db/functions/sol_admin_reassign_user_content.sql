-- Live definition of sol_admin_reassign_user_content() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_reassign_user_content(
  p_from_user uuid,
  p_to_user uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE quiz_sections SET assigned_by = p_to_user WHERE assigned_by = p_from_user;
  UPDATE chatbot_sections SET assigned_by = p_to_user WHERE assigned_by = p_from_user;
  UPDATE quizzes SET professor_id = p_to_user, updated_at = now() WHERE professor_id = p_from_user;
  UPDATE chatbots SET professor_id = p_to_user, updated_at = now() WHERE professor_id = p_from_user;
END;
$$;
REVOKE ALL ON FUNCTION sol_admin_reassign_user_content(uuid, uuid) FROM PUBLIC;
