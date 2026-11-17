import Link from 'next/link';
import type { ReactNode } from 'react';
import { Calendar, FileText, Users } from '@/components/icons';

import CopyEnrollmentButton from '@/components/CopyEnrollmentButton';
import { AddFacultyDialog } from '@/components/sections/AddFacultyDialog';
import { AddLearnersDialog } from '@/components/sections/AddLearnersDialog';
import { SectionCourseworkTable } from '@/components/sections/SectionCourseworkTable';
import { SectionEndsAtEditor } from '@/components/sections/SectionEndsAtEditor';
import { SectionRosterTable } from '@/components/sections/SectionRosterTable';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { StatCard } from '@/components/patterns/StatCard';
import { LocalDateTime } from '@/components/timezone/LocalDateTime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isSectionConcluded } from '@/lib/sectionAvailability';
import type { SectionDetailData } from '@/lib/sectionDetailData';

/** What the viewer may do on this page (admin and professor pages differ). */
export type SectionDetailCapabilities = {
  canInvite: boolean;
  canRemoveStudents: boolean;
  /** Link each discussion to its sessions page. */
  showDiscussionSessions: boolean;
  /** Which API saves the end date (admin PUT or professor PATCH). */
  endsAtSaveVia: 'admin' | 'professor';
};

type SectionDetailViewProps = {
  data: SectionDetailData;
  capabilities: SectionDetailCapabilities;
  sectionId: string;
  enrollmentActions?: ReactNode;
  quizRowActions?: (quizId: string) => ReactNode;
  discussionRowActions?: (chatbotId: string) => ReactNode;
  headerActions?: ReactNode;
  /** e.g. “Assign existing” for professor section detail */
  courseworkActions?: ReactNode;
  gradebookHref: string;
};

export function SectionDetailView({
  data,
  capabilities,
  sectionId,
  enrollmentActions,
  quizRowActions,
  discussionRowActions,
  headerActions,
  courseworkActions,
  gradebookHref,
}: SectionDetailViewProps) {
  const { section, learnerEnrollments, facultyEnrollments, quizzes, discussions } =
    data;
  const concluded = isSectionConcluded(section);
  const courseworkCount = quizzes.length + discussions.length;
  const gradebookBase = gradebookHref;
  const { canInvite } = capabilities;

  return (
    <>
      <section className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active learners"
          value={data.activeLearnerCount}
          icon={<Users className="h-4 w-4" />}
          hint={`${learnerEnrollments.length} total enrolled`}
        />
        <StatCard
          label="Faculty"
          value={data.activeFacultyCount}
          icon={<Users className="h-4 w-4" />}
          hint={`${facultyEnrollments.length} total enrolled`}
        />
        <StatCard
          label="Assignments"
          value={courseworkCount}
          icon={<FileText className="h-4 w-4" />}
          hint={`${quizzes.length} quiz${quizzes.length === 1 ? '' : 'zes'} · ${discussions.length} discussion${discussions.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Section end"
          value={
            section.endsAt
              ? <LocalDateTime value={section.endsAt} dateOnly />
              : 'Open'
          }
          icon={<Calendar className="h-4 w-4" />}
          hint={
            concluded
              ? 'Concluded for students'
              : section.endsAt
                ? <LocalDateTime value={section.endsAt} />
                : 'No end date set'
          }
        />
      </section>

      {headerActions ? (
        <div className="mt-6 flex flex-wrap gap-2">{headerActions}</div>
      ) : null}

      <section className="mt-12">
        <SectionHeading
          eyebrow="Availability"
          title="When this section ends"
          description="Students lose active access after the end date; grades remain under Past / Archived."
        />
        <div className="mt-6">
          <SectionEndsAtEditor
            sectionId={sectionId}
            endsAt={section.endsAt}
            saveVia={capabilities.endsAtSaveVia}
            sectionName={section.name}
          />
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading eyebrow="Codes" title="Enrolment access" />
        <div className="mt-6 paper paper-shadow p-6 flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            {section.course ? (
              <Badge variant="outline">{section.course.title}</Badge>
            ) : null}
            <Badge variant="info">{data.activeLearnerCount} active learners</Badge>
            <Badge variant="default">{data.activeFacultyCount} active faculty</Badge>
            {concluded ? <Badge variant="outline">Concluded</Badge> : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <span className="eyebrow text-ink-faint">Faculty code</span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-surface-sunken text-ink px-3 py-2 rounded border border-rule">
                  {section.professorEnrollmentCode}
                </code>
                <CopyEnrollmentButton code={section.professorEnrollmentCode} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="eyebrow text-ink-faint">Learner code</span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-surface-sunken text-ink px-3 py-2 rounded border border-rule">
                  {section.studentEnrollmentCode}
                </code>
                <CopyEnrollmentButton code={section.studentEnrollmentCode} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="outline" size="sm">
              <Link href={gradebookBase}>Open gradebook</Link>
            </Button>
            {enrollmentActions}
          </div>
        </div>
      </section>

      <section className="mt-16">
        <SectionHeading
          eyebrow="Faculty"
          title="Enrolled faculty"
          description={`${facultyEnrollments.length} ${
            facultyEnrollments.length === 1 ? 'member' : 'members'
          }`}
          actions={canInvite ? <AddFacultyDialog sectionId={sectionId} /> : null}
        />
        <div className="mt-6">
          <SectionRosterTable
            title="Faculty roster"
            enrollments={facultyEnrollments}
            emptyTitle="No faculty enrolled yet."
            emptyDescription="Use Add faculty to invite an instructor, TA, or grader, or share the faculty enrolment code."
          />
        </div>
      </section>

      <section className="mt-16">
        <SectionHeading
          eyebrow="Roster"
          title="Enrolled learners"
          description={`${learnerEnrollments.length} ${
            learnerEnrollments.length === 1 ? 'learner' : 'learners'
          } · ${data.activeLearnerCount} active`}
          actions={
            canInvite ? <AddLearnersDialog sectionId={sectionId} /> : null
          }
        />
        <div className="mt-6">
          <SectionRosterTable
            title="Learner roster"
            enrollments={learnerEnrollments}
            emptyTitle="No learners enrolled yet."
            emptyDescription="Use Add learners to invite by email or CSV, or share the learner enrolment code."
            sectionId={sectionId}
            canRemoveStudents={capabilities.canRemoveStudents}
          />
        </div>
      </section>

      <section className="mt-16">
        <SectionHeading
          eyebrow="Coursework"
          title="Assignments"
          description={`${courseworkCount} ${
            courseworkCount === 1 ? 'item' : 'items'
          } on this section`}
          actions={courseworkActions}
        />
        <div className="mt-6">
          <SectionCourseworkTable
            showDiscussionSessions={capabilities.showDiscussionSessions}
            quizzes={quizzes}
            discussions={discussions}
            quizRowActions={
              quizRowActions
                ? Object.fromEntries(
                    quizzes.map((q) => [q.id, quizRowActions(q.id)]),
                  )
                : undefined
            }
            discussionRowActions={
              discussionRowActions
                ? Object.fromEntries(
                    discussions.map((d) => [
                      d.id,
                      discussionRowActions(d.id),
                    ]),
                  )
                : undefined
            }
          />
        </div>
      </section>
    </>
  );
}
