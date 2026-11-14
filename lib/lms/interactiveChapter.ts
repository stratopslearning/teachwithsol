/**
 * Shah-style interactive chapter body stored on LESSON outline items
 * and on lessons.chapter (runtime).
 */

export type InteractiveChapterCheckQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
};

export type InteractiveChapterSection = {
  id: string;
  title: string;
  markdown: string;
  subsections?: Array<{ id: string; title: string }>;
  checkBank: InteractiveChapterCheckQuestion[];
};

export type InteractiveChapterBody = {
  kind: 'interactive_chapter';
  subtitle?: string;
  learningObjectives: string[];
  sections: InteractiveChapterSection[];
  wrapUpMarkdown?: string;
  capstoneMarkdown?: string;
};

export const CHAPTER_QUESTIONS_PER_ATTEMPT = 2;
/** Soft floor for publish; authoring build aims for ≥6 per section. */
export const CHAPTER_MIN_BANK_SIZE = 4;

export function isInteractiveChapterBody(
  value: unknown,
): value is InteractiveChapterBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === 'interactive_chapter' &&
    Array.isArray(v.sections) &&
    v.sections.length > 0
  );
}

/**
 * True when a chapter has real reading + practice (not an empty ensure-lessons stub).
 * Structural `isInteractiveChapterBody` alone is too weak — hollow shells skip the build step.
 */
export function isInteractiveChapterReady(
  value: unknown,
): value is InteractiveChapterBody {
  if (!isInteractiveChapterBody(value)) return false;
  if ((value.learningObjectives?.length ?? 0) < 1) return false;
  try {
    assertValidChapter(value);
    return true;
  } catch {
    return false;
  }
}

/** Flatten chapter sections into markdown for legacy lesson readers / search. */
export function chapterToMarkdown(chapter: InteractiveChapterBody): string {
  const parts: string[] = [];
  if (chapter.subtitle?.trim()) {
    parts.push(`*${chapter.subtitle.trim()}*`);
  }
  if (chapter.learningObjectives?.length) {
    parts.push('## Learning objectives');
    parts.push(
      chapter.learningObjectives.map((o) => `- ${o}`).join('\n'),
    );
  }
  for (const section of chapter.sections) {
    parts.push(`## ${section.title}`);
    parts.push(section.markdown.trim());
  }
  if (chapter.wrapUpMarkdown?.trim()) {
    parts.push('## Wrap-up');
    parts.push(chapter.wrapUpMarkdown.trim());
  }
  if (chapter.capstoneMarkdown?.trim()) {
    parts.push('## Putting it together');
    parts.push(chapter.capstoneMarkdown.trim());
  }
  return parts.filter(Boolean).join('\n\n');
}

export function pickCheckQuestions(
  bank: InteractiveChapterCheckQuestion[],
  count = CHAPTER_QUESTIONS_PER_ATTEMPT,
): InteractiveChapterCheckQuestion[] {
  if (bank.length === 0) return [];
  const shuffled = [...bank].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function gradeCheckAttempt(
  questions: InteractiveChapterCheckQuestion[],
  answers: Record<string, string>,
): { passed: boolean; results: Array<{ index: number; correct: boolean }> } {
  const results = questions.map((q, index) => {
    const given = (answers[String(index)] ?? answers[q.question] ?? '')
      .trim()
      .toLowerCase();
    const expected = q.correctAnswer.trim().toLowerCase();
    return { index, correct: given.length > 0 && given === expected };
  });
  const passed =
    results.length > 0 && results.every((r) => r.correct);
  return { passed, results };
}

export function assertValidChapter(
  chapter: InteractiveChapterBody,
): void {
  if (!chapter.sections.length) {
    throw new Error('Interactive chapter needs at least one section');
  }
  for (const section of chapter.sections) {
    if (!section.title?.trim()) {
      throw new Error('Each chapter section needs a title');
    }
    if (!section.markdown?.trim()) {
      throw new Error(`Section “${section.title}” needs reading content`);
    }
    if ((section.checkBank?.length ?? 0) < CHAPTER_MIN_BANK_SIZE) {
      throw new Error(
        `Section “${section.title}” needs at least ${CHAPTER_MIN_BANK_SIZE} check questions`,
      );
    }
    for (const q of section.checkBank) {
      if (!q.question?.trim() || !q.options || q.options.length < 2) {
        throw new Error(
          `Section “${section.title}” has an incomplete check question`,
        );
      }
      if (!q.options.includes(q.correctAnswer)) {
        throw new Error(
          `Section “${section.title}”: correctAnswer must match an option`,
        );
      }
    }
  }
}
