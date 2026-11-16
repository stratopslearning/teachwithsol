import { ApiError } from '@/lib/api/errors';
import { logAudit } from '@/lib/audit';
import { AUTHORING_CONTEXT_CHAR_BUDGET } from '@/lib/authoring/constants';
import {
  generateOutlineFromContext,
  toPersistModules,
} from '@/lib/authoring/generate';
import {
  persistGeneratedOutline,
  type OutlineDetail,
} from '@/lib/authoring/outlines';
import { assertCanManageBook } from '@/lib/books/access';
import {
  isBookTitleChapter,
  isFrontMatterChapterTitle,
} from '@/lib/books/frontMatter';
import { fetchCourseById } from '@/lib/db/entityScopedReads';
import type { AuthUser } from '@/lib/getOrCreateUser';

export {
  isFrontMatterChapterTitle,
  isBookTitleChapter,
} from '@/lib/books/frontMatter';

function buildBookAuthoringContext(
  bookTitle: string,
  chapters: Array<{ title: string; partTitle: string | null; markdown: string }>,
): string {
  const budget = AUTHORING_CONTEXT_CHAR_BUDGET;
  const lines: string[] = [
    `Hosted book excerpts for AUTHORING (faculty draft context): “${bookTitle}”`,
  ];
  let used = lines[0]!.length;

  for (const ch of chapters) {
    const part = ch.partTitle?.trim();
    const header = part
      ? `\n---\n[part:${part}] [chapter:${ch.title}]\n`
      : `\n---\n[chapter:${ch.title}]\n`;
    // Cap each chapter so one long chapter cannot dominate the budget.
    const body = ch.markdown.trim().slice(0, 2_400);
    const block = `${header}${body}`;
    if (used + block.length > budget) {
      const remaining = budget - used - header.length;
      if (remaining < 200) break;
      lines.push(`${header}${body.slice(0, remaining)}`);
      break;
    }
    lines.push(block);
    used += block.length;
  }

  return lines.join('');
}

/**
 * LLM outline from a hosted book: concept themes with quizzes, discussions,
 * and interactives (no lessons) — not one item per chapter.
 */
export async function createOutlineFromBook(
  user: AuthUser,
  bookId: string,
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<OutlineDetail> {
  const book = await assertCanManageBook(user, bookId);
  if (book.status !== 'READY') {
    throw ApiError.badRequest(
      'Book must finish processing before creating an outline',
    );
  }

  const course = await fetchCourseById(book.courseId);
  if (!course) throw ApiError.notFound('Course not found');

  const { fetchBookChaptersForRagDefiner } = await import(
    '@/lib/db/knowledgeJobDefiners'
  );
  const chapters = await fetchBookChaptersForRagDefiner(bookId);
  if (chapters.length === 0) {
    throw ApiError.badRequest(
      'Book is Ready but has no chapters to outline from. Reprocess the book, then try again.',
    );
  }

  const teachable = chapters.filter(
    (c) =>
      !isFrontMatterChapterTitle(c.title) &&
      !isBookTitleChapter(c.title, book.title),
  );
  if (teachable.length === 0) {
    const sample = chapters
      .slice(0, 3)
      .map((c) => c.title)
      .filter(Boolean)
      .join(', ');
    throw ApiError.badRequest(
      `No concept chapters found after filtering front matter (${chapters.length} chapter${chapters.length === 1 ? '' : 's'} total${sample ? `: ${sample}` : ''}). Check chapter titles.`,
    );
  }

  const materialsContext = buildBookAuthoringContext(
    book.title,
    teachable.map((c) => ({
      title: c.title,
      partTitle: c.partTitle,
      markdown: c.markdown,
    })),
  );

  const brief =
    'Design an assessment-first course from this hosted book (no lessons). Prioritize quizzes (5+ questions with at least one short answer), discussions, and fill-in-the-blanks practice over chapter narration.';

  const data = await generateOutlineFromContext({
    courseTitle: course.title,
    brief,
    materialsContext,
    titleHint: `${book.title} (from book)`,
    workspaceId: course.workspaceId,
  });

  const outline = await persistGeneratedOutline({
    user,
    courseId: book.courseId,
    title: data.title.includes(book.title)
      ? data.title
      : `${book.title} (from book)`,
    brief: `Generated from hosted book ${book.id} (${teachable.length} concept chapters)`,
    modules: toPersistModules(data),
  });

  const { updateHostedBookDefiner } = await import(
    '@/lib/db/bookWriteDefiners'
  );
  await updateHostedBookDefiner({ bookId });

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'professor.book.create_outline',
    targetType: 'course_outline',
    targetId: outline.id,
    metadata: {
      bookId,
      courseId: book.courseId,
      chapterCount: teachable.length,
      moduleCount: outline.modules.length,
    },
    ip: audit?.ip ?? null,
    userAgent: audit?.userAgent ?? null,
  });

  return outline;
}
