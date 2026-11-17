-- Live definition of sol_job_enqueue() (last changed in drizzle/0118_job_queue.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_job_enqueue(
  p_kind text,
  p_tenant_id uuid,
  p_payload jsonb,
  p_dedupe_key text,
  p_max_attempts integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_kind IS NULL OR p_kind = '' THEN
    RAISE EXCEPTION 'kind required';
  END IF;
  INSERT INTO job_queue (kind, tenant_id, payload, dedupe_key, max_attempts)
  VALUES (
    p_kind,
    p_tenant_id,
    COALESCE(p_payload, '{}'::jsonb),
    p_dedupe_key,
    GREATEST(COALESCE(p_max_attempts, 5), 1)
  )
  ON CONFLICT (kind, dedupe_key) WHERE status = 'queued' AND dedupe_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_job_enqueue(text, uuid, jsonb, text, integer) FROM PUBLIC;
