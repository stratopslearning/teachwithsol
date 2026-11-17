-- One durable queue for background work (issue #84). Rows are claimed with
-- FOR UPDATE SKIP LOCKED, so concurrent drains (Inngest, after(), cron) never
-- run the same job twice. A crashed worker's claim expires at locked_until and
-- the job is retried; after max_attempts it is marked dead.
--
-- The table holds work for every tenant, so the runtime role never touches it
-- directly: RLS is enabled with no policies and all access goes through the
-- SECURITY DEFINER functions below. Each job's handler then runs under
-- withTenant(tenant_id).
CREATE TABLE IF NOT EXISTS job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  tenant_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- At most one waiting job per (kind, dedupe_key). A running job doesn't block
-- a new one, so work requested mid-run still gets a follow-up pass.
CREATE UNIQUE INDEX IF NOT EXISTS job_queue_dedupe_idx
  ON job_queue (kind, dedupe_key)
  WHERE status = 'queued' AND dedupe_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS job_queue_ready_idx
  ON job_queue (status, run_after);
--> statement-breakpoint
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE job_queue FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    REVOKE ALL ON TABLE job_queue FROM sol_app;
  END IF;
END
$$;
--> statement-breakpoint
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_job_enqueue(text, uuid, jsonb, text, integer) FROM PUBLIC;
--> statement-breakpoint
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_job_claim(text[], integer, integer) FROM PUBLIC;
--> statement-breakpoint
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_job_finish(uuid, text, integer) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_job_enqueue(text, uuid, jsonb, text, integer) TO sol_app;
    GRANT EXECUTE ON FUNCTION sol_job_claim(text[], integer, integer) TO sol_app;
    GRANT EXECUTE ON FUNCTION sol_job_finish(uuid, text, integer) TO sol_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER TABLE job_queue OWNER TO neondb_owner;
    ALTER FUNCTION sol_job_enqueue(text, uuid, jsonb, text, integer) OWNER TO neondb_owner;
    ALTER FUNCTION sol_job_claim(text[], integer, integer) OWNER TO neondb_owner;
    ALTER FUNCTION sol_job_finish(uuid, text, integer) OWNER TO neondb_owner;
  END IF;
END
$$;
