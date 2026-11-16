'use client';

import { apiFetch } from '@/lib/api/client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/patterns/EmptyState';
import { useFilteredSortedPage } from '@/hooks/useFilteredSortedPage';
import { compareDates, compareStringsIgnoreCase } from '@/lib/listSort';
import {
  comparePersonsByLastName,
  formatPersonName,
  type PersonNameFields,
} from '@/lib/personName';
import { LocalDateTime } from '@/components/timezone/LocalDateTime';
import { confirmAction } from '@/components/feedback/ConfirmDialog';
import { PageControls } from '@/components/patterns/PageControls';

export type RosterEnrollmentRow = {
  id: string;
  enrolledAt: string | Date;
  status: string;
  person: PersonNameFields & { id: string; email: string | null };
};

type RosterSortMode =
  | 'LAST_NAME'
  | 'FIRST_NAME'
  | 'EMAIL'
  | 'ENROLLED_DESC'
  | 'ENROLLED_ASC';

const ROWS_PER_PAGE = 15;

function rosterCompare(a: RosterEnrollmentRow, b: RosterEnrollmentRow, mode: RosterSortMode) {
  switch (mode) {
    case 'FIRST_NAME':
      return compareStringsIgnoreCase(
        a.person.firstName ?? '',
        b.person.firstName ?? '',
      );
    case 'EMAIL':
      return compareStringsIgnoreCase(
        a.person.email ?? '',
        b.person.email ?? '',
      );
    case 'ENROLLED_DESC':
      return compareDates(b.enrolledAt, a.enrolledAt);
    case 'ENROLLED_ASC':
      return compareDates(a.enrolledAt, b.enrolledAt);
    case 'LAST_NAME':
    default:
      return comparePersonsByLastName(a.person, b.person);
  }
}

function DropStudentButton({
  sectionId,
  enrollmentId,
  name,
}: {
  sectionId: string;
  enrollmentId: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDrop() {
    if (!await confirmAction(`Remove ${name} from this section?`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(
          `/api/professor/section/${sectionId}/roster/${enrollmentId}`,
        { method: 'DELETE' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not remove student');
        return;
      }
      toast.success('Student removed from section');
      router.refresh();
    } catch {
      toast.error('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={onDrop}
    >
      Remove
    </Button>
  );
}

export function SectionRosterTable({
  title,
  description,
  enrollments,
  emptyTitle,
  emptyDescription,
  sectionId,
  canRemoveStudents,
}: {
  title: string;
  description?: string;
  enrollments: RosterEnrollmentRow[];
  emptyTitle: string;
  emptyDescription: string;
  sectionId?: string;
  canRemoveStudents?: boolean;
}) {
  const [sortMode, setSortMode] = useState<RosterSortMode>('LAST_NAME');
  const [search, setSearch] = useState('');
  const showActions = Boolean(canRemoveStudents && sectionId);

  const compareFn = useCallback(
    (a: RosterEnrollmentRow, b: RosterEnrollmentRow) =>
      rosterCompare(a, b, sortMode),
    [sortMode],
  );

  const {
    page,
    setPage,
    totalPages,
    paginated,
  } = useFilteredSortedPage({
    rows: enrollments,
    search,
    filterFn: useCallback((row: RosterEnrollmentRow, q: string) => {
      if (!q.trim()) return true;
      const lower = q.toLowerCase();
      const name = formatPersonName(row.person).toLowerCase();
      return (
        name.includes(lower) ||
        (row.person.email ?? '').toLowerCase().includes(lower) ||
        row.status.toLowerCase().includes(lower)
      );
    }, []),
    compareFn,
    rowsPerPage: ROWS_PER_PAGE,
  });

  if (enrollments.length === 0) {
    return (
      <EmptyState
        eyebrow="Empty"
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div>
          <h3 className="font-display text-lg text-ink">{title}</h3>
          {description ? (
            <p className="text-sm text-ink-muted mt-1">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Select
            value={sortMode}
            onValueChange={(v) => setSortMode(v as RosterSortMode)}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LAST_NAME">Last name A–Z</SelectItem>
              <SelectItem value="FIRST_NAME">First name A–Z</SelectItem>
              <SelectItem value="EMAIL">Email A–Z</SelectItem>
              <SelectItem value="ENROLLED_DESC">Enrolled (newest)</SelectItem>
              <SelectItem value="ENROLLED_ASC">Enrolled (oldest)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="search"
            placeholder="Search roster…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:w-56"
          />
        </div>
      </div>

      <div className="paper paper-shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Enrolled</TableHead>
              <TableHead>Status</TableHead>
              {showActions ? <TableHead className="w-24" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showActions ? 5 : 4}
                  className="text-center text-ink-muted py-8"
                >
                  No matches.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {formatPersonName(row.person)}
                  </TableCell>
                  <TableCell className="text-ink-muted text-sm">
                    {row.person.email ?? '-'}
                  </TableCell>
                  <TableCell className="text-sm text-ink-muted tnum">
                    <LocalDateTime value={row.enrolledAt} dateOnly />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={row.status === 'ACTIVE' ? 'success' : 'outline'}
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  {showActions ? (
                    <TableCell>
                      {row.status === 'ACTIVE' && sectionId ? (
                        <DropStudentButton
                          sectionId={sectionId}
                          enrollmentId={row.id}
                          name={formatPersonName(row.person)}
                        />
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PageControls page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
