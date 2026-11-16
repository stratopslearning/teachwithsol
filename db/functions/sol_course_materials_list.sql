-- Live definition of sol_course_materials_list() (last changed in drizzle/0055_course_hub_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_course_materials_list(p_course_id uuid)
RETURNS TABLE (
  id uuid,
  course_id uuid,
  title text,
  source_type text,
  mime_type text,
  byte_size integer,
  status text,
  error_message text,
  external_url text,
  authoring_corpus text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    m.id,
    m.course_id,
    m.title,
    m.source_type::text,
    m.mime_type,
    m.byte_size,
    m.status::text,
    m.error_message,
    m.external_url,
    m.authoring_corpus::text,
    m.created_at,
    m.updated_at
  FROM course_materials m
  WHERE m.course_id = p_course_id
    AND m.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM book_chapters bc
      WHERE bc.course_id = p_course_id
        AND bc.deleted_at IS NULL
        AND bc.material_id = m.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM knowledge_documents kd
      JOIN course_knowledge_links ckl
        ON ckl.document_id = kd.id AND ckl.course_id = p_course_id
      WHERE kd.legacy_material_id = m.id
        AND kd.deleted_at IS NULL
    )
  ORDER BY m.created_at DESC;
$$;
REVOKE ALL ON FUNCTION sol_course_materials_list(uuid) FROM PUBLIC;
