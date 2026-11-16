import Link from 'next/link';
import { Archive } from '@/components/icons';

import { fetchAdminSectionsAll } from '@/lib/admin/platformReads';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireAdmin } from '@/lib/auth';
import { appPath, withBasePath } from '@/lib/basePath';
import { partitionBySectionConclusion } from '@/lib/sectionAvailability';
import {
  LocalDateTime,
  TIMESTAMP_CELL_CLASS,
} from '@/components/timezone/LocalDateTime';

export default async function AdminArchivedSectionsPage() {
  await requireAdmin();
  // FORCE RLS: a plain db read returns no sections; use the admin definer.
  const allSectionsRaw = (await fetchAdminSectionsAll()).filter(
    (s) => s.deletedAt == null,
  );
  const { archived } = partitionBySectionConclusion(allSectionsRaw);
  const rows = [...archived].sort((a, b) => {
    const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : 0;
    const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : 0;
    return bEnd - aEnd;
  });

  return (
    <AppShell
      role="admin"
      active="workspaces"
      topbarTitle="Past sections"
    >
      <PageHeader
        breadcrumbs={[
          { label: 'Overview', href: withBasePath('/dashboard/admin') },
          {
            label: 'Sections',
            href: withBasePath('/dashboard/admin/sections'),
          },
          { label: 'Past sections' },
        ]}
        eyebrow="Archive"
        title="Past sections."
        description="Concluded sections stay here for roster and gradebook access. Clear or extend the end date on a section to bring it back to the active list."
        actions={
          <Button asChild variant="outline">
            <Link href={appPath('/dashboard/admin/sections')}>
              Back to ongoing sections
            </Link>
          </Button>
        }
      />

      <div className="mt-10">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-5 w-5" />}
            eyebrow="Nothing here"
            title="No past sections yet."
            description="When a section end date passes, it moves here from the main sections list."
          />
        ) : (
          <div className="paper paper-shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead className="min-w-[13rem]">Ended</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((section) => (
                  <TableRow key={section.id}>
                    <TableCell className="font-medium">{section.name}</TableCell>
                    <TableCell className="text-ink-muted">
                      {section.course?.title ?? '-'}
                    </TableCell>
                    <TableCell className={`text-ink-muted ${TIMESTAMP_CELL_CLASS}`}>
                        {section.endsAt
                          ? <LocalDateTime stacked value={section.endsAt} />
                          : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Concluded</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={appPath(
                              `/dashboard/admin/sections/${section.id}`,
                            )}
                          >
                            Open
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={appPath(
                              `/dashboard/admin/sections/${section.id}/gradebook`,
                            )}
                          >
                            Gradebook
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
