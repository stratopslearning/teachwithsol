/**
 * Upload size limits and accepted file types, shared by the upload UIs,
 * the API handlers and the edge middleware. No imports: safe in client
 * components and in middleware.
 */

const MB = 1024 * 1024;

/** Course material / knowledge document (PDF, DOCX, TXT, MD). */
export const MAX_UPLOAD_BYTES = 50 * MB;

/** Zip pack of materials. */
export const MAX_ZIP_UPLOAD_BYTES = 50 * MB;

/** Hosted book (EPUB, Pressbooks XML, PDF). */
export const MAX_BOOK_UPLOAD_BYTES = 50 * MB;

/** Multipart framing on top of the file itself, allowed at the edge. */
export const MULTIPART_HEADROOM_BYTES = 1 * MB;

/** `<input accept>` for materials / knowledge uploads. */
export const MATERIAL_UPLOAD_ACCEPT = '.pdf,.docx,.txt,.md,.zip';

/** `<input accept>` for hosted book uploads. */
export const BOOK_UPLOAD_ACCEPT = '.epub,.xml,.pdf';
