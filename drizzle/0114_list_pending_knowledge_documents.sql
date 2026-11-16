-- Knowledge documents had no stale/pending sweep (materials and books do), so a
-- document whose job crashed, timed out or was never delivered stayed in
-- PROCESSING / PENDING forever. Cron uses this to find and retry them.
CREATE OR REPLACE FUNCTION sol_list_pending_knowledge_documents(
  p_limit integer,
  p_stale_before timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb)
      FROM (
        SELECT id, status, workspace_id AS "workspaceId", updated_at AS "updatedAt"
        FROM knowledge_documents
        WHERE deleted_at IS NULL
          AND (
            status = 'PENDING'
            OR (status = 'PROCESSING' AND updated_at < p_stale_before)
          )
        ORDER BY created_at ASC
        LIMIT GREATEST(COALESCE(p_limit, 10), 1)
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_list_pending_knowledge_documents(integer, timestamptz) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_list_pending_knowledge_documents(integer, timestamptz) TO sol_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_list_pending_knowledge_documents(integer, timestamptz) OWNER TO neondb_owner;
  END IF;
END
$$;
