import type { ProcessingStatus } from '@/app/db/enums';

export type KnowledgeIndexStatus = ProcessingStatus;

export type MaterialDisplayStatus = 'Processing' | 'Ready' | 'Needs attention';

export function knowledgeMaterialDisplayStatus(
  status: KnowledgeIndexStatus,
  opts?: { updateAvailable?: boolean; errorMessage?: string | null },
): MaterialDisplayStatus {
  if (opts?.updateAvailable || status === 'FAILED') {
    return 'Needs attention';
  }
  if (status === 'READY') return 'Ready';
  return 'Processing';
}

export function knowledgeMaterialDisplayDetail(
  status: KnowledgeIndexStatus,
  opts?: { updateAvailable?: boolean; errorMessage?: string | null },
): string | null {
  if (opts?.updateAvailable) {
    return 'A newer library version is available';
  }
  if (status === 'FAILED') {
    return opts?.errorMessage?.trim() || 'Indexing failed';
  }
  if (status === 'PENDING') return 'Queued for indexing';
  if (status === 'PROCESSING') return 'Indexing in progress';
  return null;
}
