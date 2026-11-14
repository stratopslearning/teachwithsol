/**
 * Professor mutations for the MCP tool surface. Each function mirrors the
 * corresponding `/api/professor/*` route's authorization and behavior so an
 * agent acting through MCP can never do more than the same professor in the
 * dashboard. All throw `ApiError` on refusal.
 */
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/app/db';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import { professorCanAccessQuiz, userCanWriteQuiz } from '@/lib/quizAccess';
import {
  assignments,
  attempts,
  chatbotSections,
  chatbots,
  professorSections,
  questions,
  quizSections,
  quizzes,
  sections,
  studentSections,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { adminSupportForTenant } from '@/lib/professor/adminSupport';
import {
  setActivityActiveByEntity,
  softDeleteActivityByEntity,
  upsertActivityForDiscussion,
} from '@/lib/assignments/sync';
import { logAudit } from '@/lib/audit';
import {
  getActiveChatbot,
  professorCanLinkQuiz,
  professorEnrolledInSections,
  userCanWriteChatbot,
} from '@/lib/chatbot/access';
import { CHATBOT_MODEL } from '@/lib/chatbot/constants';
import { activeOnly } from '@/lib/db/filters';
import type { UserData } from '@/lib/getOrCreateUser';
import { getAttentionItemsForProfessor } from '@/lib/professorAttention';
import { regradeAttempt } from '@/lib/regradeAttempt';
import { parseOptionalEndsAt } from '@/lib/sectionAvailability';
import { assertTeachesSection } from '@/lib/professor/sections';
type ProfessorUser = Pick<UserData, 'id' | 'clerkId'> & {
  platformStaff?: boolean | null;
};

export type QuizQuestionInput = {
  id?: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
  question: string;
  options?: string[];
  correctAnswer?: string;
  points: number;
  order: number;
  conceptTags?: string[];
  /** Authored grading rubric (SA); published as approved when present. */
  rubric?: Array<{ id: string; description: string; weight: number }>;
  rubricStatus?: string;
};

function requiredQuizWindow(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw ApiError.badRequest('Invalid date format');
  }
  if (end <= start) {
    throw ApiError.badRequest(
      'End date and time must be after start date and time',
    );
  }
  return { start, end };
}

/** Mirrors POST /api/professor/enroll (teaching-area / join-code path). */
export async function enrollInSection(
  user: ProfessorUser,
  enrollmentCode: string,
  workspaceId?: string | null,
): Promise<{ id: string; name: string; courseId: string }> {
  const { userCanAccessTeachingArea } = await import('@/lib/authz/gates');
  if (!(await userCanAccessTeachingArea(user.id)) && !user.platformStaff) {
    throw ApiError.forbidden('Teaching access required to enroll in sections');
  }

  const {
    findSectionByProfessorCode,
    findSectionByProfessorCodeGloballyUnique,
  } = await import('@/lib/sections/enrollmentLookup');

  // Faculty codes are join invites across workspaces. Optional workspaceId only
  // disambiguates when the caller already belongs to that workspace; otherwise
  // resolve the code globally (same idea as student enroll).
  let section: Awaited<ReturnType<typeof findSectionByProfessorCode>> | undefined;
  const trimmedWorkspace = workspaceId?.trim();
  if (trimmedWorkspace) {
    const { resolveProfessorEnrollWorkspaceId } = await import(
      '@/lib/workspace'
    );
    const scope = await resolveProfessorEnrollWorkspaceId(
      user.id,
      trimmedWorkspace,
    );
    if (!scope.ok) {
      throw scope.status === 403
        ? ApiError.forbidden(scope.error)
        : ApiError.badRequest(scope.error);
    }
    section = await findSectionByProfessorCode(
      scope.workspaceId,
      enrollmentCode,
    );
  }
  if (!section) {
    const hit = await findSectionByProfessorCodeGloballyUnique(enrollmentCode);
    section = hit?.section;
  }
  if (!section) throw ApiError.notFound('Invalid enrollment code');

  const { ensureWorkspaceMembership, getCourseWorkspaceId } = await import(
    '@/lib/workspace'
  );
  const { requireWorkspaceTeaching } = await import(
    '@/lib/workspace/entitlement'
  );
  const courseWorkspaceId = await getCourseWorkspaceId(section.courseId);
  const destinationWorkspaceId =
    section.workspaceId ?? section.tenantId ?? courseWorkspaceId;
  if (!destinationWorkspaceId) {
    throw ApiError.notFound('Invalid enrollment code');
  }
  // Entitlement is on the section's workspace (not the joiner's active one).
  await requireWorkspaceTeaching(destinationWorkspaceId, user);

  const {
    professorSectionEnrollmentDefiner,
    professorSectionEnrollDefiner,
  } = await import('@/lib/db/facultyWriteDefiners');
  const existing = await professorSectionEnrollmentDefiner(
    user.id,
    section.id,
  );
  if (existing) throw ApiError.badRequest('Already enrolled in this section');

  // Seat first so destination-tenant writes see an allowed member where needed.
  const { upsertRoleBinding } = await import('@/lib/authz/bindings');
  await ensureWorkspaceMembership({
    workspaceId: destinationWorkspaceId,
    userId: user.id,
  });

  try {
    await professorSectionEnrollDefiner({
      professorId: user.id,
      sectionId: section.id,
      tenantId: destinationWorkspaceId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Already enrolled')) {
      throw ApiError.badRequest('Already enrolled in this section');
    }
    if (message.includes('Section not found')) {
      throw ApiError.notFound('Invalid enrollment code');
    }
    throw err;
  }

  await upsertRoleBinding({
    tenantId: destinationWorkspaceId,
    userId: user.id,
    scopeType: 'section',
    scopeId: section.id,
    role: 'co_instructor',
    grantedBy: user.id,
  });

  return { id: section.id, name: section.name, courseId: section.courseId };
}

/** Mirrors POST /api/professor/section/[sectionId]/leave. */
export async function leaveSection(
  user: ProfessorUser,
  sectionId: string,
): Promise<void> {
  const {
    professorSectionEnrollmentDefiner,
    professorSectionLeaveDefiner,
  } = await import('@/lib/db/facultyWriteDefiners');
  const enrollment = await professorSectionEnrollmentDefiner(
    user.id,
    sectionId,
  );
  if (!enrollment) throw ApiError.badRequest('Not enrolled in this section');

  await professorSectionLeaveDefiner(user.id, sectionId);

  const { revokeSectionTeachingBindings } = await import(
    '@/lib/lti/facultyEnrollment'
  );
  await revokeSectionTeachingBindings(user.id, sectionId);

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'education.professor_enrollment.leave',
    targetType: 'section',
    targetId: sectionId,
  });
}

/** Mirrors PATCH /api/professor/section/[sectionId] (endsAt only). */
export async function setSectionEndsAt(
  user: ProfessorUser,
  sectionId: string,
  endsAtIso: string | null,
): Promise<{ id: string; endsAt: Date | null }> {
  await assertTeachesSection(user, sectionId);

  const { fetchSectionById } = await import('@/lib/db/entityScopedReads');
  const section = await fetchSectionById(sectionId);
  if (!section) throw ApiError.notFound('Section not found');

  const parsed = parseOptionalEndsAt(endsAtIso);
  if (!parsed.ok) throw ApiError.badRequest(parsed.error);

  const { setSectionEndsAtDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  return setSectionEndsAtDefiner(sectionId, parsed.endsAt);
}

/** Mirrors POST /api/professor/section/.../quiz/.../unassign. */
export async function unassignQuizFromSection(
  user: ProfessorUser,
  sectionId: string,
  quizId: string,
): Promise<void> {
  const { requireSectionTeaching } = await import('@/lib/workspace/entitlement');
  await requireSectionTeaching(sectionId, user);
  await assertTeachesSection(user, sectionId);
  const { unassignQuizSectionDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  await unassignQuizSectionDefiner(sectionId, quizId);
}

/** Mirrors POST /api/professor/section/.../chatbot/.../unassign. */
export async function unassignDiscussionFromSection(
  user: ProfessorUser,
  sectionId: string,
  chatbotId: string,
): Promise<void> {
  const { requireSectionTeaching } = await import('@/lib/workspace/entitlement');
  await requireSectionTeaching(sectionId, user);
  await assertTeachesSection(user, sectionId);
  const { unassignChatbotSectionDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  await unassignChatbotSectionDefiner(sectionId, chatbotId);
}

/** Mirrors POST /api/professor/quiz/create (PROFESSOR only). */
export async function createQuiz(
  user: ProfessorUser,
  input: {
    title: string;
    description?: string;
    sectionIds: string[];
    maxAttempts: number;
    timeLimit?: number;
    passingScore: number;
    startDate: string;
    endDate: string;
    questions: QuizQuestionInput[];
    /** Defaults true for dashboard/MCP; Authoring passes false for draft publish. */
    isActive?: boolean;
    /** Set when created from Authoring QUIZ publish. */
    sourceOutlineItemId?: string | null;
  },
): Promise<{ id: string; title: string; sectionIds: string[] }> {
  if (input.sectionIds.length === 0) {
    throw ApiError.badRequest('Select at least one section');
  }
  {
    const { requireSectionTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    await requireSectionTeaching(input.sectionIds[0]!, user);
  }

  // Binding-based: content.write on every target section (no users.role check).
  for (const id of input.sectionIds) {
    if (!(await authorizeOnSection(user, 'content.write', id))) {
      throw ApiError.forbidden(
        'You can only assign quizzes to sections you teach',
      );
    }
  }

  const { start, end } = requiredQuizWindow(input.startDate, input.endDate);
  const isActive = input.isActive ?? true;

  // FORCE RLS: resolve section via DEFINER; create quiz via DEFINER write
  // (withTenant GUC flakes break quizzes WITH CHECK on Neon).
  const {
    createQuizDefiner,
    fetchCourseById,
    fetchOfferingIdsForCourse,
    fetchSectionById,
  } = await import('@/lib/db/entityScopedReads');
  const targetSection = await fetchSectionById(input.sectionIds[0]!);
  if (!targetSection) throw ApiError.badRequest('Section not found');

  let tenantId = targetSection.tenantId ?? targetSection.workspaceId;
  let offeringId = targetSection.offeringId;
  if (!tenantId && targetSection.courseId) {
    const course = await fetchCourseById(targetSection.courseId);
    tenantId = course?.tenantId ?? course?.workspaceId ?? null;
  }
  if (!offeringId && targetSection.courseId) {
    const offeringIds = await fetchOfferingIdsForCourse(targetSection.courseId);
    offeringId = offeringIds[0] ?? null;
  }
  if (!tenantId || !offeringId) {
    throw ApiError.badRequest(
      'Section is missing tenant or offering — cannot create quiz',
    );
  }

  const quizId = await createQuizDefiner({
    title: input.title,
    description: input.description ?? null,
    professorId: user.id,
    tenantId,
    offeringId,
    courseId: targetSection.courseId ?? null,
    maxAttempts: input.maxAttempts,
    timeLimit: input.timeLimit ?? null,
    passingScore: input.passingScore,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    isActive,
    sourceOutlineItemId: input.sourceOutlineItemId ?? null,
    sectionIds: input.sectionIds,
    questions: input.questions.map((q) => ({
      type: q.type,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      points: q.points,
      order: q.order,
      conceptTags: (q.conceptTags ?? []).map((t) => t.trim()).filter(Boolean),
      rubric: q.rubric ?? null,
      rubricStatus:
        q.rubric && q.rubric.length > 0 ? q.rubricStatus ?? 'approved' : 'none',
    })),
  });

  return { id: quizId, title: input.title, sectionIds: input.sectionIds };
}

/** Mirrors PUT /api/professor/quiz/[quizId]/update (owner or admin). */
export async function updateQuiz(
  user: ProfessorUser,
  quizId: string,
  input: {
    title: string;
    description?: string;
    sectionIds: string[];
    maxAttempts: number;
    timeLimit?: number;
    passingScore: number;
    startDate: string;
    endDate: string;
    isActive: boolean;
    questions: QuizQuestionInput[];
  },
): Promise<{ id: string; title: string; sectionIds: string[] }> {
  const existing = await db.query.quizzes.findFirst({
    where: and(eq(quizzes.id, quizId), activeOnly(quizzes.deletedAt)),
    with: { questions: true },
  });
  if (!existing) throw ApiError.notFound('Quiz not found');

  if (!(await userCanWriteQuiz(user, quizId))) {
    throw ApiError.forbidden('You do not have write access to this quiz');
  }

  for (const id of input.sectionIds) {
    if (!(await authorizeOnSection(user, 'content.write', id))) {
      throw ApiError.forbidden(
        'You can only assign quizzes to sections you teach',
      );
    }
  }

  const { start, end } = requiredQuizWindow(input.startDate, input.endDate);

  const { assertQuizQuestionsEditable } = await import(
    '@/lib/quiz/questionEditGuard'
  );
  const existingForCompare = existing.questions.map((q) => ({
    type: q.type,
    question: q.question,
    options: Array.isArray(q.options) ? (q.options as string[]) : null,
    correctAnswer: q.correctAnswer,
    points: q.points,
    order: q.order,
  }));

  await assertQuizQuestionsEditable(
    quizId,
    existingForCompare,
    input.questions,
  );

  const { quizQuestionsChanged } = await import('@/lib/quiz/questionEditGuard');
  const questionsChanged = quizQuestionsChanged(
    existingForCompare,
    input.questions,
  );

  // FORCE RLS: bare quiz/questions/sections updates flake without tenant GUC.
  const { updateQuizDefiner } = await import('@/lib/db/entityScopedReads');
  await updateQuizDefiner({
    quizId,
    title: input.title,
    description: input.description ?? null,
    maxAttempts: input.maxAttempts,
    timeLimit: input.timeLimit ?? null,
    passingScore: input.passingScore,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    isActive: input.isActive,
    assignedBy: user.id,
    sectionIds: input.sectionIds,
    questions: input.questions.map((q) => ({
      id: q.id,
      type: q.type,
      question: q.question,
      options: q.options ?? null,
      correctAnswer: q.correctAnswer ?? null,
      points: q.points,
      order: q.order,
      conceptTags: q.conceptTags,
    })),
  });

  if (input.isActive) {
    const { onActivityReleased } = await import('@/lib/lti/lineItems');
    void onActivityReleased({ quizId });
  }

  if (questionsChanged) {
    try {
      const { createQuizVersionSnapshot } = await import('@/lib/quiz/versions');
      await createQuizVersionSnapshot({
        quizId,
        createdByUserId: user.id,
      });
    } catch (err) {
      console.warn('[updateQuiz] post-edit quiz version snapshot failed', err);
    }
  }

  return { id: quizId, title: input.title, sectionIds: input.sectionIds };
}

/** Mirrors POST /api/professor/quiz/[quizId]/duplicate. */
export async function duplicateQuiz(
  user: ProfessorUser,
  quizId: string,
): Promise<{ id: string; title: string }> {
  const original = await db.query.quizzes.findFirst({
    where: and(eq(quizzes.id, quizId), activeOnly(quizzes.deletedAt)),
    with: { questions: true, sectionAssignments: true },
  });
  if (!original) throw ApiError.notFound('Quiz not found');

  if (!(await professorCanAccessQuiz(user, quizId))) {
    throw ApiError.forbidden('You do not have access to this quiz');
  }

  const adminSupport = await adminSupportForTenant(user, original.tenantId);
  const authorId = original.professorId;
  const isAuthor = Boolean(authorId && authorId === user.id);
  let sectionsToCopy = original.sectionAssignments;

  if (!adminSupport && !isAuthor) {
    const writable: typeof original.sectionAssignments = [];
    for (const sa of original.sectionAssignments) {
      if (await authorizeOnSection(user, 'content.write', sa.sectionId)) {
        writable.push(sa);
      }
    }
    if (writable.length === 0) {
      throw ApiError.forbidden('You do not have access to this quiz');
    }
    sectionsToCopy = writable;
  }

  const { duplicateQuizDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  return duplicateQuizDefiner({
    sourceQuizId: quizId,
    professorId: user.id,
    title: `${original.title} (Copy)`,
    sectionIds: sectionsToCopy.map((sa) => sa.sectionId),
  });
}

/** Mirrors POST /api/professor/quiz/[quizId]/archive (owner or admin). */
export async function archiveQuiz(
  user: ProfessorUser,
  quizId: string,
): Promise<{ id: string }> {
  const existing = await db.query.quizzes.findFirst({
    where: and(eq(quizzes.id, quizId), activeOnly(quizzes.deletedAt)),
  });
  if (!existing) throw ApiError.notFound('Quiz not found');

  if (!(await userCanWriteQuiz(user, quizId))) {
    throw ApiError.forbidden('You do not have write access to this quiz');
  }

  const { archiveQuizDefiner } = await import('@/lib/db/facultyWriteDefiners');
  const archivedId = await archiveQuizDefiner(quizId);
  await softDeleteActivityByEntity({ quizId });

  return { id: archivedId };
}

/** Mirrors POST /api/professor/quiz/[quizId]/visibility (owner or admin). */
export async function setQuizVisibility(
  user: ProfessorUser,
  quizId: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  // FORCE RLS: bare quiz reads return null → false "Quiz not found".
  const { fetchQuizById, setQuizVisibilityDefiner } = await import(
    '@/lib/db/entityScopedReads'
  );
  const existing = await fetchQuizById(quizId);
  if (!existing) throw ApiError.notFound('Quiz not found');

  if (!(await userCanWriteQuiz(user, quizId))) {
    throw ApiError.forbidden('You do not have write access to this quiz');
  }

  await setQuizVisibilityDefiner(quizId, isActive);

  if (isActive) {
    const { onActivityReleased } = await import('@/lib/lti/lineItems');
    void onActivityReleased({ quizId });
  }

  return { id: quizId, isActive };
}

/**
 * Assign an existing quiz to additional sections the caller teaches (owner or
 * admin). Additive: unlike update, existing assignments are kept.
 */
export async function assignQuizSections(
  user: ProfessorUser,
  quizId: string,
  sectionIds: string[],
): Promise<{ id: string; sectionIds: string[] }> {
  if (sectionIds.length === 0) {
    throw ApiError.badRequest('Provide at least one section id');
  }
  {
    const { requireSectionTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    await requireSectionTeaching(sectionIds[0]!, user);
  }

  const quiz = await db.query.quizzes.findFirst({
    where: and(eq(quizzes.id, quizId), activeOnly(quizzes.deletedAt)),
  });
  if (!quiz) throw ApiError.notFound('Quiz not found');
  if (!(await userCanWriteQuiz(user, quizId))) {
    throw ApiError.forbidden('You do not have write access to this quiz');
  }

  for (const id of sectionIds) {
    if (!(await authorizeOnSection(user, 'content.write', id))) {
      throw ApiError.forbidden(
        'You can only assign quizzes to sections you teach',
      );
    }
  }

  const { assignQuizSectionsDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  const linked = await assignQuizSectionsDefiner({
    quizId,
    assignedBy: user.id,
    sectionIds,
  });
  return { id: quizId, sectionIds: linked };
}

/** Mirrors POST /api/professor/attempt/[attemptId]/regrade. */
export async function regradeAttemptForProfessor(
  user: ProfessorUser,
  attemptId: string,
  options: { fallbackOnly?: boolean } = {},
): Promise<{ regradedQuestionCount: number; pendingQuestionCount: number }> {
  const attempt = await db.query.attempts.findFirst({
    where: (t, { eq: eqOp }) => eqOp(t.id, attemptId),
  });
  if (!attempt) throw ApiError.notFound('Attempt not found');
  if (!attempt.submittedAt) {
    throw ApiError.badRequest('Only submitted attempts can be re-graded');
  }

  if (!(await authorizeOnSection(user, 'regrade.resolve', attempt.sectionId))) {
    throw ApiError.forbidden('You cannot re-grade attempts in this section');
  }

  const result = await regradeAttempt(attemptId, {
    fallbackOnly: options.fallbackOnly ?? true,
  });
  return {
    regradedQuestionCount: result.regradedQuestionCount,
    pendingQuestionCount: result.pendingQuestionCount,
  };
}

/**
 * Synchronous variant of the attention regrade used by MCP: processes a
 * bounded batch inline so the agent can report the outcome. Capped low
 * because each item may hit OpenAI.
 */
export async function regradeAttentionBatch(
  user: ProfessorUser,
  options: { limit?: number } = {},
): Promise<{
  processed: number;
  regradedQuestionCount: number;
  pendingQuestionCount: number;
  errors: number;
}> {
  const limit = Math.max(1, Math.min(options.limit ?? 10, 20));
  const queue = await getAttentionItemsForProfessor(user.id, { limit });

  let regraded = 0;
  let pending = 0;
  let errors = 0;

  for (const item of queue) {
    try {
      const result = await regradeAttempt(item.attemptId, {
        fallbackOnly: true,
      });
      regraded += result.regradedQuestionCount;
      pending += result.pendingQuestionCount;
    } catch (error) {
      errors += 1;
      console.error('[mcp regrade_attention] attempt failed', {
        attemptId: item.attemptId,
        error,
      });
    }
  }

  return {
    processed: queue.length,
    regradedQuestionCount: regraded,
    pendingQuestionCount: pending,
    errors,
  };
}

/** Mirrors POST /api/professor/chatbot/create. */
export async function createDiscussion(
  user: ProfessorUser,
  input: {
    title: string;
    description?: string;
    personaName?: string;
    instructions: string;
    systemPrompt: string;
    relatedQuizId?: string | null;
    sectionIds?: string[];
    /** Defaults true for dashboard/MCP; Authoring passes false for draft publish. */
    isActive?: boolean;
  },
): Promise<{ id: string; title: string }> {
  const sectionIds = input.sectionIds ?? [];
  const isActive = input.isActive ?? true;

  {
    const ok = await professorEnrolledInSections(user, sectionIds);
    if (!ok) {
      throw ApiError.forbidden(
        'You can only assign discussions to sections you teach',
      );
    }
    if (input.relatedQuizId) {
      const canLink = await professorCanLinkQuiz(user, input.relatedQuizId);
      if (!canLink) throw ApiError.forbidden('You cannot link that quiz');
    }
  }

  const { createChatbotDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  const { fetchSectionById } = await import('@/lib/db/entityScopedReads');
  const section =
    sectionIds.length > 0 ? await fetchSectionById(sectionIds[0]!) : null;
  const tenantId = section?.tenantId ?? section?.workspaceId ?? null;
  const created = await createChatbotDefiner({
    professorId: user.id,
    title: input.title,
    description: input.description ?? null,
    personaName: input.personaName ?? 'Professor Emma',
    instructions: input.instructions,
    systemPrompt: input.systemPrompt,
    relatedQuizId: input.relatedQuizId ?? null,
    model: CHATBOT_MODEL,
    isActive,
    sectionIds,
    tenantId,
  });

  await upsertActivityForDiscussion(created.id, {
    courseId: section?.courseId ?? null,
    professorId: user.id,
    title: created.title,
    description: input.description ?? null,
    isActive,
    tenantId,
  });

  return { id: created.id, title: created.title };
}

/** Mirrors PUT /api/professor/chatbot/[id]/update (owner or admin). */
export async function updateDiscussion(
  user: ProfessorUser,
  chatbotId: string,
  input: {
    title?: string;
    description?: string | null;
    personaName?: string;
    instructions?: string;
    systemPrompt?: string;
    relatedQuizId?: string | null;
    sectionIds?: string[];
    isActive?: boolean;
    aiPolicy?: { mode: 'hints' | 'guided' | 'full_after_submit' } | null;
  },
): Promise<{ id: string }> {
  const bot = await getActiveChatbot(chatbotId);
  if (!bot || bot.isTemplate) throw ApiError.notFound('Discussion not found');
  if (!(await userCanWriteChatbot(user, bot))) {
    throw ApiError.forbidden('You do not have write access to this discussion');
  }

  if (input.sectionIds) {
    const ok = await professorEnrolledInSections(user, input.sectionIds);
    if (!ok) {
      throw ApiError.forbidden(
        'You can only assign discussions to sections you teach',
      );
    }
  }
  if (input.relatedQuizId) {
    const canLink = await professorCanLinkQuiz(user, input.relatedQuizId);
    if (!canLink) throw ApiError.forbidden('You cannot link that quiz');
  }

  const { updateChatbotDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  const { fetchSectionById } = await import('@/lib/db/entityScopedReads');
  const payload: Record<string, unknown> = {
    chatbotId,
    assignedBy: user.id,
  };
  if (input.title != null) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.personaName != null) payload.personaName = input.personaName;
  if (input.instructions != null) payload.instructions = input.instructions;
  if (input.systemPrompt != null) payload.systemPrompt = input.systemPrompt;
  if (input.relatedQuizId !== undefined) {
    payload.relatedQuizId = input.relatedQuizId;
  }
  if (input.isActive != null) payload.isActive = input.isActive;
  if (input.sectionIds) payload.sectionIds = input.sectionIds;
  if (input.aiPolicy !== undefined) {
    const { parseAiPolicy } = await import('@/lib/chatbot/aiPolicy');
    payload.aiPolicy = input.aiPolicy ? parseAiPolicy(input.aiPolicy) : null;
  }

  await updateChatbotDefiner(payload);

  const title = input.title ?? bot.title;
  const description =
    input.description !== undefined ? input.description : bot.description;
  const isActive = input.isActive ?? bot.isActive;
  const firstSectionId = input.sectionIds?.[0];
  const section = firstSectionId
    ? await fetchSectionById(firstSectionId)
    : null;
  if (bot.professorId) {
    await upsertActivityForDiscussion(chatbotId, {
      courseId: section?.courseId ?? null,
      professorId: bot.professorId,
      title,
      description,
      isActive,
      tenantId:
        section?.tenantId ??
        section?.workspaceId ??
        bot.tenantId ??
        null,
    });
  }

  if (isActive) {
    const { onActivityReleased } = await import('@/lib/lti/lineItems');
    void onActivityReleased({ chatbotId });
  }

  return { id: chatbotId };
}

/** Mirrors POST /api/professor/chatbot/[id]/assign (additive). */
export async function assignDiscussion(
  user: ProfessorUser,
  chatbotId: string,
  sectionIds: string[],
): Promise<{ id: string }> {
  if (sectionIds.length === 0) {
    throw ApiError.badRequest('Provide at least one section id');
  }
  {
    const { requireSectionTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    await requireSectionTeaching(sectionIds[0]!, user);
  }

  const bot = await getActiveChatbot(chatbotId);
  if (!bot || bot.isTemplate) {
    throw ApiError.badRequest('Duplicate the template before assigning');
  }
  if (!(await userCanWriteChatbot(user, bot))) {
    throw ApiError.forbidden('You do not have write access to this discussion');
  }
  {
    const ok = await professorEnrolledInSections(user, sectionIds);
    if (!ok) {
      throw ApiError.forbidden('You can only assign to sections you teach');
    }
  }

  const { assignChatbotSectionsDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  await assignChatbotSectionsDefiner({
    chatbotId,
    assignedBy: user.id,
    sectionIds,
  });

  return { id: chatbotId };
}

/** Mirrors POST /api/professor/chatbot/[id]/duplicate (template or owned). */
export async function duplicateDiscussion(
  user: ProfessorUser,
  chatbotId: string,
): Promise<{ id: string; title: string }> {
  const source = await getActiveChatbot(chatbotId);
  if (!source) throw ApiError.notFound('Discussion not found');
  if (!source.isTemplate && !(await userCanWriteChatbot(user, source))) {
    throw ApiError.forbidden('You do not have access to this discussion');
  }

  const { duplicateChatbotDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  return duplicateChatbotDefiner({
    sourceChatbotId: chatbotId,
    professorId: user.id,
  });
}

/** Mirrors POST /api/professor/quiz/[quizId]/section-copy. */
export async function sectionCopyQuiz(
  user: ProfessorUser,
  quizId: string,
): Promise<{ id: string; title: string; sectionIds: string[] }> {
  const { fetchQuizById, fetchQuizSectionIds } = await import(
    '@/lib/db/entityScopedReads'
  );
  const original = await fetchQuizById(quizId);
  if (!original) throw ApiError.notFound('Quiz not found');
  const quizAuthorId = original.professorId;
  if (quizAuthorId && quizAuthorId === user.id) {
    throw ApiError.conflict('Quiz is already editable');
  }

  const assignedSectionIds = await fetchQuizSectionIds(quizId);
  const adminSupport = await adminSupportForTenant(user, original.tenantId);
  let sectionIdsToMove = assignedSectionIds;
  if (!adminSupport) {
    const writable: string[] = [];
    for (const sectionId of assignedSectionIds) {
      if (await authorizeOnSection(user, 'content.write', sectionId)) {
        writable.push(sectionId);
      }
    }
    sectionIdsToMove = writable;
  }
  if (sectionIdsToMove.length === 0) {
    throw ApiError.forbidden(
      'No editable section assignments found for this quiz',
    );
  }

  const { sectionCopyQuizDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  return sectionCopyQuizDefiner({
    sourceQuizId: quizId,
    professorId: user.id,
    sectionIds: sectionIdsToMove,
  });
}
