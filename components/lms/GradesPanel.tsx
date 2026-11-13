'use client';

import { useRouter } from 'next/navigation';

import ExportResultsWrapper from '@/components/ExportResultsWrapper';
import { EmptyState } from '@/components/patterns/EmptyState';
import { SectionGradebookTable } from '@/components/sections/SectionGradebookTable';
import type { GradebookLearnerRow } from '@/components/sections/SectionGradebookTable';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { withBasePath } from '@/lib/basePath';

type SectionRow = {
  id: string;
  name: string;
};

export function GradesPanel({
  courseId,
  sections,
  selectedSectionId,
  matrix,
  studentPreview = false,
}: {
  courseId: string;
  sections: SectionRow[];
  selectedSectionId: string | null;
  matrix: {
    learners: GradebookLearnerRow[];
    quizzes: Array<{ id: string; title: string }>;
    completionColumns: Array<{
      id: string;
      title: string;
      type: 'LESSON' | 'DISCUSSION' | 'INTERACTIVE';
    }>;
  } | null;
  studentPreview?: boolean;
}) {
  const router = useRouter();
  const selected =
    sections.find((s) => s.id === selectedSectionId) ?? sections[0] ?? null;

  function onSectionChange(sectionId: string) {
    const params = new URLSearchParams();
    if (studentPreview) params.set('as', 'student');
    params.set('section', sectionId);
    router.push(
      withBasePath(
        `/dashboard/professor/courses/${courseId}/grades?${params.toString()}`,
      ),
    );
  }

  if (sections.length === 0) {
    return (
      <EmptyState
        eyebrow="Gradebook"
        title="No teachable sections yet."
        description="Create a section for this course to open the gradebook."
      />
    );
  }

  const emptyLearners = !matrix || matrix.learners.length === 0;
  const emptyWork =
    !matrix ||
    (matrix.quizzes.length === 0 && matrix.completionColumns.length === 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Gradebook</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Best score per learner
            {selected ? ` · ${selected.name}` : ''}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sections.length > 1 ? (
            <Select
              value={selected?.id}
              onValueChange={onSectionChange}
            >
              <SelectTrigger className="h-10 w-[220px]" aria-label="Section">
                <SelectValue placeholder="Section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {!studentPreview && matrix && matrix.quizzes.length > 0 ? (
            <ExportResultsWrapper quizzes={matrix.quizzes} />
          ) : null}
          {!studentPreview ? (
            <>
              <Button variant="outline" size="sm" disabled>
                Import
              </Button>
              <Button variant="outline" size="sm" disabled>
                Export
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {emptyLearners || emptyWork ? (
        <EmptyState
          eyebrow="Empty"
          title={
            emptyLearners
              ? 'No learners enrolled.'
              : 'No assignments in this section yet.'
          }
          description={
            emptyLearners
              ? 'Share the learner enrolment code on the section detail page.'
              : 'Assign a quiz, lesson, or interactive to start the gradebook.'
          }
        />
      ) : (
        <SectionGradebookTable
          learners={matrix!.learners}
          quizzes={matrix!.quizzes}
          completionColumns={matrix!.completionColumns}
        />
      )}
    </div>
  );
}
