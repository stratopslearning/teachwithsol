-- Live definition of sol_job_finish() (last changed in drizzle/0118_job_queue.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_job_finish(
  p_id uuid,
  p_error text,
  p_retry_seconds integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  UPDATE job_queue
  SET status = CASE
        WHEN p_error IS NULL THEN 'done'
        WHEN attempts >= max_attempts THEN 'dead'
        ELSE 'queued'
      END,
      run_after = CASE
        WHEN p_error IS NULL THEN run_after
        ELSE now() + make_interval(secs => GREATEST(COALESCE(p_retry_seconds, 60), 0))
      END,
      locked_until = NULL,
      last_error = CASE WHEN p_error IS NULL THEN last_error ELSE left(p_error, 2000) END,
      updated_at = now()
  WHERE id = p_id AND status = 'running'
  RETURNING status INTO v_status;
  RETURN v_status;
EXCEPTION
  -- Re-queueing can collide with a newer waiting job for the same dedupe key;
  -- that job already covers the retry, so this one is finished.
  WHEN unique_violation THEN
    UPDATE job_queue
    SET status = 'done', locked_until = NULL, last_error = left(p_error, 2000), updated_at = now()
    WHERE id = p_id;
    RETURN 'done';
END;
$$;
REVOKE ALL ON FUNCTION sol_job_finish(uuid, text, integer) FROM PUBLIC;
