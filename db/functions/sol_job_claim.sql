-- Live definition of sol_job_claim() (last changed in drizzle/0118_job_queue.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_job_claim(
  p_kinds text[],
  p_limit integer,
  p_lock_seconds integer
)
RETURNS SETOF job_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Claims that expired on their last allowed attempt are dead, not retried.
  UPDATE job_queue
  SET status = 'dead',
      locked_until = NULL,
      last_error = COALESCE(last_error, 'lock expired (worker did not finish)'),
      updated_at = now()
  WHERE status = 'running'
    AND locked_until < now()
    AND attempts >= max_attempts
    AND (p_kinds IS NULL OR kind = ANY (p_kinds));

  -- Housekeeping: finished jobs are kept a week for debugging.
  DELETE FROM job_queue
  WHERE status IN ('done', 'dead')
    AND updated_at < now() - interval '7 days';

  RETURN QUERY
  UPDATE job_queue j
  SET status = 'running',
      attempts = j.attempts + 1,
      locked_until = now() + make_interval(secs => GREATEST(COALESCE(p_lock_seconds, 300), 30)),
      updated_at = now()
  WHERE j.id IN (
    SELECT q.id
    FROM job_queue q
    WHERE (p_kinds IS NULL OR q.kind = ANY (p_kinds))
      AND (
        (q.status = 'queued' AND q.run_after <= now())
        OR (q.status = 'running' AND q.locked_until < now())
      )
    ORDER BY q.run_after
    LIMIT GREATEST(COALESCE(p_limit, 10), 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION sol_job_claim(text[], integer, integer) FROM PUBLIC;
