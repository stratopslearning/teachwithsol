-- Live definition of sol_create_student_invite() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_student_invite(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
  v_section uuid := (p_payload->>'sectionId')::uuid;
  v_email text := lower(trim(COALESCE(p_payload->>'email', '')));
  v_token_hash text := p_payload->>'tokenHash';
  v_invited_by uuid := NULLIF(p_payload->>'invitedBy', '')::uuid;
  v_expires timestamptz := (p_payload->>'expiresAt')::timestamptz;
  v_id uuid;
BEGIN
  IF v_tenant IS NULL OR v_section IS NULL OR v_email = '' OR v_token_hash IS NULL OR v_expires IS NULL THEN
    RAISE EXCEPTION 'tenantId, sectionId, email, tokenHash, expiresAt required';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE section_student_invites
  SET expires_at = now()
  WHERE section_id = v_section
    AND lower(email) = v_email
    AND claimed_at IS NULL;

  INSERT INTO section_student_invites (
    tenant_id, section_id, email, token_hash, invited_by, expires_at
  ) VALUES (
    v_tenant, v_section, v_email, v_token_hash, v_invited_by, v_expires
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'expiresAt', v_expires);
END;
$$;
REVOKE ALL ON FUNCTION sol_create_student_invite(jsonb) FROM PUBLIC;
