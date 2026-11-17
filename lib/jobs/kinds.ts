/**
 * Job kinds and their retry settings. Kept free of feature imports so any
 * module can enqueue; the handlers themselves live in lib/jobs/handlers.ts.
 */
export type JobSpec = {
  /** Total tries before the job is marked dead. */
  maxAttempts: number;
  /** How long a claim lasts before another drain may take the job over. */
  lockSeconds: number;
};

export const JOB_SPECS = {
  /** Grade pending short answers on one attempt. payload: { attemptId } */
  grade_attempt: { maxAttempts: 4, lockSeconds: 300 },
  /** Bulk Attention regrade of one attempt. payload: { attemptId } */
  regrade_attempt: { maxAttempts: 3, lockSeconds: 300 },
  /** Extract, chunk and embed a course material. payload: { materialId, reset? } */
  process_material: { maxAttempts: 3, lockSeconds: 900 },
  /** Extract, chunk and embed a knowledge document. payload: { documentId, reset? } */
  process_document: { maxAttempts: 3, lockSeconds: 900 },
  /** Parse a hosted book into chapters and index it. payload: { bookId, reset? } */
  process_book: { maxAttempts: 3, lockSeconds: 900 },
  /** Sync a knowledge connector. payload: { connectorId } */
  sync_connector: { maxAttempts: 2, lockSeconds: 900 },
  /** Send pending LTI grade passbacks (own table and backoff). payload: { limit } */
  lti_passback_drain: { maxAttempts: 3, lockSeconds: 300 },
} as const satisfies Record<string, JobSpec>;

export type JobKind = keyof typeof JOB_SPECS;

export const JOB_KINDS = Object.keys(JOB_SPECS) as JobKind[];

export function isJobKind(value: unknown): value is JobKind {
  return typeof value === 'string' && value in JOB_SPECS;
}
