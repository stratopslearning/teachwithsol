'use client';

import { CourseAssignmentsClient } from '@/app/dashboard/professor/assignments/[courseId]/CourseAssignmentsClient';
import { AssignmentsTableClient } from '@/components/assignments/AssignmentsTableClient';
import { CreateAssignmentGroupForm } from '@/components/lms/CreateForms';
import { appPath } from '@/lib/basePath';
import type { ActivityListItem } from '@/lib/assignments/types';

type GroupRow = {
  id: string;
  name: string;
  weight: number;
  dropLowest: number;
};

type SectionOption = { id: string; title: string };

export function AssignmentsPanel({
  courseId,
  items,
  groups,
  sectionOptions = [],
  studentPreview = false,
  teachingBlocked = false,
}: {
  courseId: string;
  items: ActivityListItem[];
  groups: GroupRow[];
  sectionOptions?: SectionOption[];
  studentPreview?: boolean;
  teachingBlocked?: boolean;
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
          <CreateAssignmentGroupForm courseId={courseId} compact />
        ) : null}
      </div>

      {studentPreview ? (
        <AssignmentsTableClient items={items} role="student" />
      ) : (
        <CourseAssignmentsClient
          activities={items}
          sectionOptions={sectionOptions}
          createQuizHref={
            teachingBlocked
              ? undefined
              : appPath(`/dashboard/professor/quiz/new?courseId=${courseId}`)
          }
          importQuizHref={
            teachingBlocked
              ? undefined
              : appPath(
                  `/dashboard/professor/quiz/new?courseId=${courseId}&import=csv`,
                )
          }
          createDiscussionHref={
            teachingBlocked
              ? undefined
              : appPath(
                  `/dashboard/professor/discussions/new?courseId=${courseId}`,
                )
          }
          createInteractiveHref={
            teachingBlocked
              ? undefined
              : appPath(
                  `/dashboard/professor/interactive/new?courseId=${courseId}`,
                )
          }
          authoringHref={appPath(`/dashboard/professor/authoring/${courseId}`)}
        />
      )}
    </div>
  );
}
