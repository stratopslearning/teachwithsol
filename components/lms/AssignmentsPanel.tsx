'use client';

import { AssignmentsTableClient } from '@/components/assignments/AssignmentsTableClient';
import { CreateAssignmentGroupForm } from '@/components/lms/CreateForms';
import { Button } from '@/components/ui/button';
import { withBasePath } from '@/lib/basePath';
import type { ActivityListItem } from '@/lib/assignments/types';

type GroupRow = {
  id: string;
  name: string;
  weight: number;
  dropLowest: number;
};

export function AssignmentsPanel({
  courseId,
  items,
  groups,
  studentPreview = false,
}: {
  courseId: string;
  items: ActivityListItem[];
  groups: GroupRow[];
  studentPreview?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Assignments</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Quizzes, lessons, and interactives for this course
            {groups.length > 0
              ? ` · ${groups.length} weighting group${groups.length === 1 ? '' : 's'}`
              : ''}
            .
          </p>
        </div>
        {!studentPreview ? (
          <div className="flex flex-wrap items-center gap-2">
            <CreateAssignmentGroupForm courseId={courseId} compact />
            <Button asChild size="sm" className="h-10">
              <a
                href={withBasePath(
                  `/dashboard/professor/assignments/${courseId}`,
                )}
              >
                + Assignment
              </a>
            </Button>
          </div>
        ) : null}
      </div>

      <AssignmentsTableClient
        items={items}
        role={studentPreview ? 'student' : 'professor'}
      />
    </div>
  );
}
