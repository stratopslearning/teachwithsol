-- Audit 2026-11-18 (#143, #144).
--
-- 1. Three tenant tables had tenant_id but no row-level security; app code
--    filtered by tenant, but the database didn't back it up. They get the same
--    FORCE RLS + tenant policy as every other tenant table.
ALTER TABLE grading_batches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE grading_batches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS grading_batches_tenant_isolation ON grading_batches;
--> statement-breakpoint
CREATE POLICY grading_batches_tenant_isolation ON grading_batches
  USING ((tenant_id)::text = sol_tenant_guc())
  WITH CHECK ((tenant_id)::text = sol_tenant_guc());
--> statement-breakpoint
ALTER TABLE grading_override_examples ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE grading_override_examples FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS grading_override_examples_tenant_isolation ON grading_override_examples;
--> statement-breakpoint
CREATE POLICY grading_override_examples_tenant_isolation ON grading_override_examples
  USING ((tenant_id)::text = sol_tenant_guc())
  WITH CHECK ((tenant_id)::text = sol_tenant_guc());
--> statement-breakpoint
ALTER TABLE unit_insights ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE unit_insights FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS unit_insights_tenant_isolation ON unit_insights;
--> statement-breakpoint
CREATE POLICY unit_insights_tenant_isolation ON unit_insights
  USING ((tenant_id)::text = sol_tenant_guc())
  WITH CHECK ((tenant_id)::text = sol_tenant_guc());
--> statement-breakpoint
-- 2. Six SECURITY DEFINER functions were executable by PUBLIC. Only the
--    runtime role needs them.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'resolve_api_token(text)',
    'resolve_lti_platform(text,text)',
    'sol_outline_item_by_id(uuid)',
    'sol_course_authoring_chunks(uuid,integer,uuid[])',
    'sol_outline_by_id(uuid)',
    'append_audit(uuid,text,text,text,text,jsonb,uuid,text,text,boolean)'
  ] LOOP
    IF to_regprocedure(fn) IS NULL THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO sol_app', fn);
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
  END LOOP;
END
$$;
