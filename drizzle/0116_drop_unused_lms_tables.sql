-- peer_discussion_posts and outcome_links were never read or written by the
-- app (verified 2026-11-16: no references in code, 0 rows in production).
-- The other LMS tables (peer_discussions, learning_outcomes, ...) stay: they
-- are live through lib/db/lmsDefiners.ts.
DROP TABLE IF EXISTS peer_discussion_posts;
--> statement-breakpoint
DROP TABLE IF EXISTS outcome_links;
