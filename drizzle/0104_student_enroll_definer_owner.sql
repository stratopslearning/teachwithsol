-- sol_upsert_student_enrollment is owned by sol_migrator (no BYPASSRLS).
-- Even with a tenantId hint, FORCE RLS can still flake on Neon pooled
-- connections. Re-own to neondb_owner (BYPASSRLS), matching other entity
-- resolve DEFINER functions (0052 / 0093).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_upsert_student_enrollment(jsonb) OWNER TO neondb_owner;
  END IF;
END
$$;
