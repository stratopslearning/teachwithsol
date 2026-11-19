-- Live definition of sol_job_queue_stats() (last changed in drizzle/0120_job_queue_stats.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_job_queue_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ready', count(*) FILTER (WHERE status = 'queued' AND run_after <= now()),
    'running', count(*) FILTER (WHERE status = 'running'),
    'oldestReadySeconds', COALESCE(
      EXTRACT(EPOCH FROM now() - min(run_after) FILTER (WHERE status = 'queued' AND run_after <= now()))::int,
      0
    ),
    'deadLast24h', count(*) FILTER (WHERE status = 'dead' AND updated_at > now() - interval '24 hours')
  )
  FROM job_queue;
$$;
REVOKE ALL ON FUNCTION sol_job_queue_stats() FROM PUBLIC;
