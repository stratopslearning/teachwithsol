import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { FileText } from '@/components/icons';
import { EmptyState } from '@/components/patterns/EmptyState';
import { SectionHubShell } from '@/components/student/SectionHubShell';
import {
  requireStudentSectionLms,
  studentActiveTool,
} from '@/lib/lms/studentSectionContext';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  const { user, ctx, lms } = await requireStudentSectionLms(sectionId);
  const syllabus = lms.syllabusMarkdown?.trim() ?? '';

  return (
    <SectionHubShell
      sectionId={ctx.sectionId}
      sectionName={ctx.sectionName}
      courseTitle={ctx.courseTitle}
      activeTab={studentActiveTool('syllabus', lms.enabled)}
      tools={lms.enabled ? lms.studentTools : undefined}
      user={user}
      description="Course syllabus"
    >
      <div className="space-y-5">
        <div>
          <h2 className="font-display text-2xl text-ink">Syllabus</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Course overview, policies, and expectations.
          </p>
        </div>

        {syllabus ? (
          <article className="rounded-xl border border-rule/80 bg-surface px-5 py-6">
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-display prose-a:text-brand">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {syllabus}
              </ReactMarkdown>
            </div>
          </article>
        ) : (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            eyebrow="Syllabus"
            title="No syllabus posted yet"
            description="Your instructor has not published a syllabus for this course."
          />
        )}
      </div>
    </SectionHubShell>
  );
}
