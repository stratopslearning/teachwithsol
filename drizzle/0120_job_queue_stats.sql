-- Queue health for /api/health (#148): job_queue is closed to sol_app, so
-- the counts come through a definer. Returns counts only, no payloads.
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_job_queue_stats() FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_job_queue_stats() TO sol_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_job_queue_stats() OWNER TO neondb_owner;
  END IF;
END
$$;
