-- Live definition of sol_outline_tree_by_id() (last changed in drizzle/0059_course_authoring_chunks.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_outline_tree_by_id(p_outline_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', o.id,
    'courseId', o.course_id,
    'tenantId', o.tenant_id,
    'title', o.title,
    'status', o.status,
    'brief', o.brief,
    'hasPriorCorpus', o.has_prior_corpus,
    'bodiesBuilt', o.bodies_built,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at,
    'modules', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'title', m.title,
          'summary', m.summary,
          'position', m.position,
          'items', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', i.id,
                'moduleId', i.module_id,
                'type', i.type,
                'title', i.title,
                'status', i.status,
                'body', i.body,
                'sourceMaterialIds', i.source_material_ids,
                'variantOfItemId', i.variant_of_item_id,
                'faithfulBody', i.faithful_body,
                'publishedQuizId', i.published_quiz_id,
                'publishedChatbotId', i.published_chatbot_id,
                'publishedLessonId', i.published_lesson_id,
                'publishedInteractiveId', i.published_interactive_id,
                'position', i.position,
                'reviewFlags', i.review_flags,
                'reviewStatus', i.review_status
              ) ORDER BY i.position
            )
            FROM outline_items i
            WHERE i.module_id = m.id AND i.deleted_at IS NULL
          ), '[]'::jsonb)
        ) ORDER BY m.position
      )
      FROM outline_modules m
      WHERE m.outline_id = o.id AND m.deleted_at IS NULL
    ), '[]'::jsonb)
  ) END
  FROM course_outlines o
  WHERE o.id = p_outline_id AND o.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_outline_tree_by_id(uuid) FROM PUBLIC;
