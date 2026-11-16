-- Live definition of sol_update_hosted_book() (last changed in drizzle/0091_hosted_books_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_update_hosted_book(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := (p_payload->>'bookId')::uuid;
  v_tenant uuid;
  v_row hosted_books%ROWTYPE;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'bookId required';
  END IF;

  SELECT COALESCE(hb.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM hosted_books hb
  JOIN courses c ON c.id = hb.course_id
  WHERE hb.id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Book not found';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Book tenant could not be resolved';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE hosted_books
  SET
    tenant_id = COALESCE(tenant_id, v_tenant),
    s3_key = CASE
      WHEN p_payload ? 's3Key' THEN NULLIF(p_payload->>'s3Key', '')
      ELSE s3_key
    END,
    title = CASE
      WHEN p_payload ? 'title' THEN left(COALESCE(NULLIF(trim(p_payload->>'title'), ''), title), 500)
      ELSE title
    END,
    status = CASE
      WHEN p_payload ? 'status' THEN p_payload->>'status'
      ELSE status
    END,
    error_message = CASE
      WHEN p_payload ? 'errorMessage' THEN NULLIF(p_payload->>'errorMessage', '')
      ELSE error_message
    END,
    is_released = CASE
      WHEN p_payload ? 'isReleased' THEN (p_payload->>'isReleased')::boolean
      ELSE is_released
    END,
    deleted_at = CASE
      WHEN p_payload ? 'deletedAt' THEN NULLIF(p_payload->>'deletedAt', '')::timestamptz
      ELSE deleted_at
    END,
    updated_at = now()
  WHERE id = v_id
    AND (
      NULLIF(p_payload->>'onlyIfStatus', '') IS NULL
      OR status = p_payload->>'onlyIfStatus'
    )
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_update_hosted_book(jsonb) FROM PUBLIC;
