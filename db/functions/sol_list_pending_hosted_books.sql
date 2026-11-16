-- Live definition of sol_list_pending_hosted_books() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_pending_hosted_books(
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
        SELECT id, status, course_id AS "courseId", updated_at AS "updatedAt"
        FROM hosted_books
        WHERE deleted_at IS NULL
          AND (
            status = 'PENDING'
            OR (status = 'PROCESSING' AND updated_at < p_stale_before)
          )
        ORDER BY created_at ASC
        LIMIT GREATEST(COALESCE(p_limit, 3), 1)
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_list_pending_hosted_books(integer, timestamptz) FROM PUBLIC;
