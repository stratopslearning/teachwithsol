import { defaultEmbedModel } from '@/lib/ai/modelRouter';

/** Soft char budget for course-material context injected into chatbot prompts. */
export const SAFE_MATERIALS_CONTEXT_CHAR_BUDGET = 4_000;

/** Top-k chunks retrieved per student turn. */
export const MATERIALS_RETRIEVE_TOP_K = 6;

/** Approx chars per embedding/chunk target (~500 tokens). */
export const CHUNK_TARGET_CHARS = 2_000;
export const CHUNK_OVERLAP_CHARS = 200;

/** Max upload size for a single file (50 MB; matches zip/book caps). */
export { MAX_UPLOAD_BYTES } from '@/lib/uploadLimits';

/** Max size for a Knowledge zip pack (50 MB). */
export { MAX_ZIP_UPLOAD_BYTES } from '@/lib/uploadLimits';

/** Cap extracted Knowledge docs per zip. */
export const MAX_ZIP_KNOWLEDGE_FILES = 40;

/** Max nesting depth for paths inside a Knowledge zip. */
export const MAX_ZIP_PATH_DEPTH = 8;

export const ALLOWED_UPLOAD_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
]);

export const EMBEDDING_MODEL = defaultEmbedModel();
