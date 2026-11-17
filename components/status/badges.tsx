import { Badge } from '@/components/ui/badge';

/**
 * Shared status labels. Learner-visible content is "Released" or "Draft"
 * (the visibility control says Release / Unrelease); attempts are "Passed"
 * or "Failed".
 */
export function releaseLabel(isActive: boolean): 'Released' | 'Draft' {
  return isActive ? 'Released' : 'Draft';
}

export function ReleaseBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'success' : 'outline'}>{releaseLabel(isActive)}</Badge>
  );
}

export function PassFailBadge({ passed }: { passed: boolean | null | undefined }) {
  return passed ? (
    <Badge variant="success">Passed</Badge>
  ) : (
    <Badge variant="destructive">Failed</Badge>
  );
}
