/**
 * Knowledge scope model (Phase 4 merge scaffolding).
 *
 * **OrganizationLibrary** — documents in `knowledge_documents` keyed by
 * `workspace_id`. Versions live in S3; chunks in `knowledge_chunks`. Faculty
 * upload via `addWorkspaceDocumentFromUpload` / connectors; visibility is
 * `workspace` or `personal`.
 *
 * **Offering** — course-term attachment via `course_knowledge_links` (pins
 * `document_id` + `pinned_version_id` onto a `course_id`). RAG and authoring
 * read shared chunks only through these links. `authoring_corpus` tags
 * `prior_course` vs `this_term` for retrieval weighting.
 *
 * **Preferred write path for new uploads:** workspace library document +
 * `course_knowledge_links` row (see `addWorkspaceDocumentFromUpload` with
 * `courseId`). Legacy `course_materials` /
 * `course_material_chunks` remain for books and pre-migration rows; retirement
 * is gated by `lib/knowledge/retireLegacyMaterials.ts` (no table drops).
 *
 * **OCR:** scanned PDFs in the shared pipeline use Amazon Textract when
 * native extract is thin — see `processKnowledgeDocument` → `ocrBufferWithTextract`.
 */

export type KnowledgeScope = 'organization_library' | 'offering';

/** Maps API / UI scope names to storage layers. */
export const KNOWLEDGE_SCOPE = {
  organizationLibrary: 'organization_library' satisfies KnowledgeScope,
  offering: 'offering' satisfies KnowledgeScope,
} as const;
