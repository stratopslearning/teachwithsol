import { ClipboardList } from '@/components/icons';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Badge } from '@/components/ui/badge';
import { SectionHubShell } from '@/components/student/SectionHubShell';
import {
  requireStudentSectionLms,
  studentActiveTool,
} from '@/lib/lms/studentSectionContext';
import { listCourseRubricsDefiner } from '@/lib/db/lmsDefiners';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  const { user, ctx, lms } = await requireStudentSectionLms(sectionId);
  const rubrics = await listCourseRubricsDefiner(ctx.courseId);

  return (
    <SectionHubShell
      sectionId={ctx.sectionId}
      sectionName={ctx.sectionName}
      courseTitle={ctx.courseTitle}
      activeTab={studentActiveTool('rubrics', lms.enabled)}
      tools={lms.enabled ? lms.studentTools : undefined}
      user={user}
      description="Grading rubrics"
    >
      <div className="space-y-5">
        <div>
          <h2 className="font-display text-2xl text-ink">Rubrics</h2>
          <p className="mt-1 text-sm text-ink-muted">
            How work in this course is scored.
          </p>
        </div>

        {rubrics.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            eyebrow="Rubrics"
            title="No rubrics yet"
            description="When your instructor adds grading rubrics, they will show up here."
          />
        ) : (
          <ul className="divide-y divide-rule/60 overflow-hidden rounded-xl border border-rule/80 bg-surface">
            {rubrics.map((r) => {
              const title = String(r.title ?? 'Rubric');
              const points =
                r.points != null && Number.isFinite(Number(r.points))
                  ? Number(r.points)
                  : null;
              const description =
                typeof r.description === 'string' ? r.description.trim() : '';
              return (
                <li key={String(r.id)} className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-ink">{title}</h3>
                    {points != null ? (
                      <Badge
                        variant="secondary"
                        className="font-mono text-[0.65rem]"
                      >
                        {points} pts
                      </Badge>
                    ) : null}
                  </div>
                  {description ? (
                    <p className="mt-1 text-sm text-ink-muted">{description}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SectionHubShell>
  );
}
