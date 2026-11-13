/**
 * MCP tool catalog for the SOL professor server.
 *
 * Every tool wraps a `lib/professor/*` service, so authorization (section
 * enrollment, quiz ownership, role checks) and audit logging behave exactly
 * like the dashboard. Tools never expose more than the professor could see
 * in the UI. Destructive tools require an explicit `confirm: true` argument.
 */
import { z } from 'zod';

import { ApiError } from '@/lib/api/errors';
import type { ProfessorApiAuth } from '@/lib/api/professorAuth';
import type { TokenScope } from '@/lib/professorApiTokens';
import {
  getProfessorSectionDetail,
  listProfessorSections,
} from '@/lib/professor/sections';
import {
  getProfessorQuiz,
  listProfessorQuizzes,
} from '@/lib/professor/quizzes';
import {
  exportResultsCsv,
  getAttemptDetail,
  getSectionGradebook,
  listQuizAttempts,
} from '@/lib/professor/grading';
import {
  getDiscussionSession,
  getProfessorDiscussion,
  listDiscussionSessions,
  listProfessorDiscussions,
} from '@/lib/professor/discussions';
import {
  archiveQuiz,
  setQuizVisibility,
  assignDiscussion,
  assignQuizSections,
  createDiscussion,
  createQuiz,
  duplicateDiscussion,
  duplicateQuiz,
  enrollInSection,
  leaveSection,
  regradeAttemptForProfessor,
  regradeAttentionBatch,
  sectionCopyQuiz,
  setSectionEndsAt,
  unassignDiscussionFromSection,
  unassignQuizFromSection,
  updateDiscussion,
  updateQuiz,
} from '@/lib/professor/mutations';
import { getAttentionItemsForProfessor } from '@/lib/professorAttention';
import { isoDateTimeRequired, quizWindowSuperRefine } from '@/lib/quizSchemas';
import {
  addMaterialFromUrl,
  getCourseMaterial,
  linkDocumentToCourse,
  listCourseLinkedDocuments,
  listCourseMaterials,
  listTeachableCourses,
  softDeleteMaterial,
  unlinkDocumentFromCourse,
} from '@/lib/knowledge';
import {
  acceptSwitchUp,
  approveAndBuildOutline,
  archiveOutline,
  generateCourseOutline,
  getCurrentOutlineForCourse,
  getOutlineDetail,
  listAuthoringRevisions,
  listOutlinesForCourse,
  previewOutlineItem,
  proposeOutlineSkeleton,
  proposeSwitchUp,
  publishOutlineItem,
  refineOutlineChat,
  releaseOutlineItem,
  restoreAuthoringRevision,
  runRolloverChecks,
  searchCourseMaterialsForAuthoring,
  updateOutlineItem,
  updateOutlineMeta,
} from '@/lib/authoring';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import {
  getConceptMastery,
  getLessonCompletion,
} from '@/lib/analytics';
import { logAudit } from '@/lib/audit';
import { db } from '@/app/db';
import { lessons } from '@/app/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';

export interface McpToolContext {
  auth: ProfessorApiAuth;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  /** Token scope required; null = any authenticated token. */
  scope: TokenScope | null;
  /** Destructive tools must be called with `confirm: true`. */
  destructive?: boolean;
  handler: (args: Record<string, unknown>, ctx: McpToolContext) => Promise<unknown>;
}

const confirmField = z
  .boolean()
  .describe('Must be true. Confirms the user approved this destructive action.');

const questionSchema = z.object({
  id: z.string().uuid().optional().describe('Existing question id (updates only)'),
  type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']),
  question: z.string().min(1).describe('The question text / stem'),
  options: z
    .array(z.string())
    .optional()
    .describe('Answer options (MULTIPLE_CHOICE only)'),
  correctAnswer: z
    .string()
    .optional()
    .describe(
      'Correct option text for MULTIPLE_CHOICE, "true"/"false" for TRUE_FALSE, reference answer for SHORT_ANSWER',
    ),
  points: z.number().int().min(1).default(1),
  order: z.number().int().min(0).describe('0-based display order'),
});

export const MCP_TOOLS: McpToolDefinition[] = [
  // ---- Me ------------------------------------------------------------
  {
    name: 'whoami',
    description:
      'Who am I? Returns the authenticated professor (name, email, platformStaff) and the scopes this token has.',
    schema: z.object({}),
    scope: null,
    handler: async (_args, ctx) => ({
      id: ctx.auth.user.id,
      name:
        [ctx.auth.user.firstName, ctx.auth.user.lastName]
          .filter(Boolean)
          .join(' ') || ctx.auth.user.email,
      email: ctx.auth.user.email,
      platformStaff: ctx.auth.user.platformStaff,
      scopes: ctx.auth.scopes,
    }),
  },
  {
    name: 'list_capabilities',
    description:
      'List every SOL tool available, its required scope, and whether this token can call it.',
    schema: z.object({}),
    scope: null,
    handler: async (_args, ctx) => ({
      tools: MCP_TOOLS.map((t) => ({
        name: t.name,
        scope: t.scope,
        allowed: t.scope == null || ctx.auth.scopes.includes(t.scope),
        destructive: Boolean(t.destructive),
      })),
    }),
  },

  // ---- Sections -------------------------------------------------------
  {
    name: 'list_sections',
    description:
      'List sections I teach, split into active and archived (concluded). Includes course, learner count, and end date.',
    schema: z.object({}),
    scope: 'read',
    handler: (_args, ctx) => listProfessorSections(ctx.auth.user),
  },
  {
    name: 'get_section',
    description:
      'Full detail for one section I teach: roster (learners + faculty), enrollment codes, assigned quizzes with submission counts, and discussions.',
    schema: z.object({ sectionId: z.string().uuid() }),
    scope: 'read',
    handler: (args, ctx) =>
      getProfessorSectionDetail(ctx.auth.user, args.sectionId as string),
  },
  {
    name: 'enroll_section',
    description:
      'Enroll me (as teaching faculty) into a section using its professor enrollment code.',
    schema: z.object({
      enrollmentCode: z.string().min(1).describe('Professor enrollment code'),
      workspaceId: z
        .string()
        .uuid()
        .optional()
        .describe(
          'Optional: disambiguate when you already belong to that workspace. Faculty codes also resolve across workspaces without this.',
        ),
    }),
    scope: 'sections:write',
    handler: (args, ctx) =>
      enrollInSection(
        ctx.auth.user,
        args.enrollmentCode as string,
        args.workspaceId as string | undefined,
      ),
  },
  {
    name: 'leave_section',
    description:
      'Leave a section I teach. I lose access to its roster and gradebook. Destructive: requires confirm=true.',
    schema: z.object({
      sectionId: z.string().uuid(),
      confirm: confirmField,
    }),
    scope: 'sections:write',
    destructive: true,
    handler: async (args, ctx) => {
      await leaveSection(ctx.auth.user, args.sectionId as string);
      return { success: true };
    },
  },
  {
    name: 'set_section_ends_at',
    description:
      'Set or clear a section end date (ISO datetime, or null to clear). After the end date, students see the section as archived and cannot start new work.',
    schema: z.object({
      sectionId: z.string().uuid(),
      endsAt: z
        .union([z.string(), z.null()])
        .describe('ISO datetime, or null to clear the end date'),
    }),
    scope: 'sections:write',
    handler: (args, ctx) =>
      setSectionEndsAt(
        ctx.auth.user,
        args.sectionId as string,
        (args.endsAt as string | null) ?? null,
      ),
  },
  {
    name: 'unassign_quiz_from_section',
    description:
      'Remove a quiz from one section I teach (the quiz itself is not deleted). Destructive: requires confirm=true.',
    schema: z.object({
      sectionId: z.string().uuid(),
      quizId: z.string().uuid(),
      confirm: confirmField,
    }),
    scope: 'sections:write',
    destructive: true,
    handler: async (args, ctx) => {
      await unassignQuizFromSection(
        ctx.auth.user,
        args.sectionId as string,
        args.quizId as string,
      );
      return { success: true };
    },
  },
  {
    name: 'unassign_discussion_from_section',
    description:
      'Remove a discussion bot from one section I teach (the discussion is not deleted). Destructive: requires confirm=true.',
    schema: z.object({
      sectionId: z.string().uuid(),
      discussionId: z.string().uuid(),
      confirm: confirmField,
    }),
    scope: 'sections:write',
    destructive: true,
    handler: async (args, ctx) => {
      await unassignDiscussionFromSection(
        ctx.auth.user,
        args.sectionId as string,
        args.discussionId as string,
      );
      return { success: true };
    },
  },

  // ---- Quizzes ----------------------------------------------------------
  {
    name: 'list_quizzes',
    description:
      'List quizzes assigned to sections I teach (mine and shared), with question counts, submission stats, and class averages.',
    schema: z.object({}),
    scope: 'read',
    handler: async (_args, ctx) => ({
      quizzes: await listProfessorQuizzes(ctx.auth.user),
    }),
  },
  {
    name: 'get_quiz',
    description:
      'Get one quiz with its questions and section assignments. Answer keys are included only if I own the quiz.',
    schema: z.object({ quizId: z.string().uuid() }),
    scope: 'read',
    handler: (args, ctx) =>
      getProfessorQuiz(ctx.auth.user, args.quizId as string),
  },
  {
    name: 'create_quiz',
    description:
      'Create a quiz with questions and assign it to sections I teach. Supports MULTIPLE_CHOICE, TRUE_FALSE, and SHORT_ANSWER (AI-graded against the reference answer).',
    schema: z
      .object({
      title: z.string().min(1),
      description: z.string().optional(),
      sectionIds: z
        .array(z.string().uuid())
        .min(1)
        .describe('Sections to assign the quiz to (must teach all of them)'),
      maxAttempts: z.number().int().min(1).max(10).default(1),
      timeLimit: z.number().int().min(1).optional().describe('Minutes'),
      passingScore: z
        .number()
        .int()
        .min(0)
        .max(100)
        .default(60)
        .describe('Passing percentage threshold'),
      startDate: isoDateTimeRequired.describe('ISO datetime quiz opens'),
      endDate: isoDateTimeRequired.describe(
        'ISO datetime quiz closes (due date)',
      ),
      questions: z.array(questionSchema).min(1),
    })
      .superRefine(quizWindowSuperRefine),
    scope: 'quizzes:write',
    handler: (args, ctx) =>
      createQuiz(
        ctx.auth.user,
        args as Parameters<typeof createQuiz>[1],
      ),
  },
  {
    name: 'update_quiz',
    description:
      'Update a quiz I own. Replaces title, settings, questions, and section assignments with the provided values (fetch with get_quiz first, then send the full updated definition).',
    schema: z
      .object({
      quizId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      sectionIds: z.array(z.string().uuid()).min(1),
      maxAttempts: z.number().int().min(1).max(10).default(1),
      timeLimit: z.number().int().min(1).optional(),
      passingScore: z.number().int().min(0).max(100).default(60),
      startDate: isoDateTimeRequired.describe('ISO datetime quiz opens'),
      endDate: isoDateTimeRequired.describe(
        'ISO datetime quiz closes (due date)',
      ),
      isActive: z.boolean().default(true),
      questions: z.array(questionSchema).min(1),
    })
      .superRefine(quizWindowSuperRefine),
    scope: 'quizzes:write',
    handler: (args, ctx) => {
      const { quizId, ...rest } = args as { quizId: string } & Parameters<
        typeof updateQuiz
      >[2];
      return updateQuiz(ctx.auth.user, quizId, rest);
    },
  },
  {
    name: 'duplicate_quiz',
    description:
      'Duplicate a quiz (mine or a co-taught one) into a new inactive copy I own, keeping questions and my section assignments.',
    schema: z.object({ quizId: z.string().uuid() }),
    scope: 'quizzes:write',
    handler: (args, ctx) =>
      duplicateQuiz(ctx.auth.user, args.quizId as string),
  },
  {
    name: 'set_quiz_visibility',
    description:
      'Publish or hide a quiz I own. Hidden quizzes stay in the library as drafts; students cannot start them. This is not archive (soft-delete).',
    schema: z.object({
      quizId: z.string().uuid(),
      isActive: z.boolean().describe('true = visible to students, false = draft'),
    }),
    scope: 'quizzes:write',
    handler: (args, ctx) =>
      setQuizVisibility(
        ctx.auth.user,
        args.quizId as string,
        args.isActive as boolean,
      ),
  },
  {
    name: 'archive_quiz',
    description:
      'Archive (soft-delete) a quiz I own. It disappears from all sections immediately. Destructive: requires confirm=true.',
    schema: z.object({
      quizId: z.string().uuid(),
      confirm: confirmField,
    }),
    scope: 'quizzes:write',
    destructive: true,
    handler: (args, ctx) => archiveQuiz(ctx.auth.user, args.quizId as string),
  },
  {
    name: 'section_copy_quiz',
    description:
      "Take ownership of a co-taught quiz for MY sections: creates an editable copy owned by me and moves my sections' assignments and attempts onto it. Destructive: requires confirm=true.",
    schema: z.object({
      quizId: z.string().uuid(),
      confirm: confirmField,
    }),
    scope: 'quizzes:write',
    destructive: true,
    handler: (args, ctx) =>
      sectionCopyQuiz(ctx.auth.user, args.quizId as string),
  },
  {
    name: 'assign_quiz_sections',
    description:
      'Assign a quiz I own to additional sections I teach (additive; existing assignments are kept).',
    schema: z.object({
      quizId: z.string().uuid(),
      sectionIds: z.array(z.string().uuid()).min(1),
    }),
    scope: 'quizzes:write',
    handler: (args, ctx) =>
      assignQuizSections(
        ctx.auth.user,
        args.quizId as string,
        args.sectionIds as string[],
      ),
  },

  // ---- Grading ----------------------------------------------------------
  {
    name: 'get_gradebook',
    description:
      'Gradebook matrix for a section I teach: best score per learner per quiz, plus each learner average. Education-record access (audited).',
    schema: z.object({ sectionId: z.string().uuid() }),
    scope: 'read',
    handler: (args, ctx) =>
      getSectionGradebook(ctx.auth.user, args.sectionId as string),
  },
  {
    name: 'list_attempts',
    description:
      'Submitted attempts for a quiz across sections I teach (optionally one section). Education-record access (audited).',
    schema: z.object({
      quizId: z.string().uuid(),
      sectionId: z.string().uuid().optional(),
    }),
    scope: 'read',
    handler: async (args, ctx) => ({
      attempts: await listQuizAttempts(ctx.auth.user, args.quizId as string, {
        sectionId: args.sectionId as string | undefined,
      }),
    }),
  },
  {
    name: 'get_attempt',
    description:
      'Full detail for one attempt: answers, scores, and AI grading feedback. Education-record access (audited).',
    schema: z.object({ attemptId: z.string().uuid() }),
    scope: 'read',
    handler: (args, ctx) =>
      getAttemptDetail(ctx.auth.user, args.attemptId as string),
  },
  {
    name: 'regrade_attempt',
    description:
      'Re-grade one submitted attempt in a section I teach. fallbackOnly=true (default) only re-grades questions stuck in pending/fallback state; false re-grades all short answers.',
    schema: z.object({
      attemptId: z.string().uuid(),
      fallbackOnly: z.boolean().default(true),
    }),
    scope: 'grades:write',
    handler: (args, ctx) =>
      regradeAttemptForProfessor(ctx.auth.user, args.attemptId as string, {
        fallbackOnly: (args.fallbackOnly as boolean | undefined) ?? true,
      }),
  },
  {
    name: 'list_attention',
    description:
      'Attempts needing my grading attention (stuck or failed AI grading) across sections I teach, with per-attempt pending counts.',
    schema: z.object({
      limit: z.number().int().min(1).max(100).default(50),
    }),
    scope: 'read',
    handler: async (args, ctx) => ({
      items: await getAttentionItemsForProfessor(ctx.auth.user.id, {
        limit: (args.limit as number | undefined) ?? 50,
      }),
    }),
  },
  {
    name: 'regrade_attention',
    description:
      'Re-grade a batch from my attention queue (up to 20 attempts, processed synchronously: may take a minute). Destructive: requires confirm=true because it calls the AI grader.',
    schema: z.object({
      limit: z.number().int().min(1).max(20).default(10),
      confirm: confirmField,
    }),
    scope: 'grades:write',
    destructive: true,
    handler: (args, ctx) =>
      regradeAttentionBatch(ctx.auth.user, {
        limit: (args.limit as number | undefined) ?? 10,
      }),
  },
  {
    name: 'export_results',
    description:
      'Export submitted quiz results as CSV text (student, quiz, score, attempt number). Optional quizId and dateFrom/dateTo (YYYY-MM-DD) filters. Education-record access (audited).',
    schema: z.object({
      quizId: z.string().uuid().optional(),
      dateFrom: z.string().optional().describe('YYYY-MM-DD inclusive'),
      dateTo: z.string().optional().describe('YYYY-MM-DD inclusive'),
    }),
    scope: 'read',
    handler: (args, ctx) =>
      exportResultsCsv(ctx.auth.user, {
        quizId: args.quizId as string | undefined,
        dateFrom: args.dateFrom as string | undefined,
        dateTo: args.dateTo as string | undefined,
      }),
  },

  // ---- Discussions --------------------------------------------------------
  {
    name: 'list_discussions',
    description:
      'List my Socratic discussion bots and available templates, with section assignments and linked quizzes.',
    schema: z.object({}),
    scope: 'read',
    handler: async (_args, ctx) => ({
      discussions: await listProfessorDiscussions(ctx.auth.user),
    }),
  },
  {
    name: 'get_discussion',
    description:
      'Get one discussion bot I own (or a template), including its instructions and system prompt.',
    schema: z.object({ discussionId: z.string().uuid() }),
    scope: 'read',
    handler: (args, ctx) =>
      getProfessorDiscussion(ctx.auth.user, args.discussionId as string),
  },
  {
    name: 'create_discussion',
    description:
      'Create a Socratic discussion bot (persona, instructions shown to students, system prompt for the AI), optionally linked to a quiz and assigned to sections I teach.',
    schema: z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      personaName: z.string().min(1).max(100).default('Professor Emma'),
      instructions: z
        .string()
        .min(1)
        .max(10_000)
        .describe('Guidance shown to students'),
      systemPrompt: z
        .string()
        .min(1)
        .max(50_000)
        .describe('System prompt steering the AI persona'),
      relatedQuizId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe('Quiz to reference in learning mode (never leaks answer keys)'),
      sectionIds: z.array(z.string().uuid()).default([]),
    }),
    scope: 'discussions:write',
    handler: (args, ctx) =>
      createDiscussion(
        ctx.auth.user,
        args as Parameters<typeof createDiscussion>[1],
      ),
  },
  {
    name: 'update_discussion',
    description:
      'Update a discussion bot I own. Only provided fields change; sectionIds (when provided) replaces the assignment list.',
    schema: z.object({
      discussionId: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      personaName: z.string().min(1).max(100).optional(),
      instructions: z.string().min(1).max(10_000).optional(),
      systemPrompt: z.string().min(1).max(50_000).optional(),
      relatedQuizId: z.string().uuid().nullable().optional(),
      sectionIds: z.array(z.string().uuid()).optional(),
      isActive: z.boolean().optional(),
    }),
    scope: 'discussions:write',
    handler: (args, ctx) => {
      const { discussionId, ...rest } = args as {
        discussionId: string;
      } & Parameters<typeof updateDiscussion>[2];
      return updateDiscussion(ctx.auth.user, discussionId, rest);
    },
  },
  {
    name: 'duplicate_discussion',
    description:
      'Duplicate a template or one of my discussion bots into a new bot I own (required before assigning a template to sections).',
    schema: z.object({ discussionId: z.string().uuid() }),
    scope: 'discussions:write',
    handler: (args, ctx) =>
      duplicateDiscussion(ctx.auth.user, args.discussionId as string),
  },
  {
    name: 'assign_discussion',
    description:
      'Assign a discussion bot I own to sections I teach (additive).',
    schema: z.object({
      discussionId: z.string().uuid(),
      sectionIds: z.array(z.string().uuid()).min(1),
    }),
    scope: 'discussions:write',
    handler: (args, ctx) =>
      assignDiscussion(
        ctx.auth.user,
        args.discussionId as string,
        args.sectionIds as string[],
      ),
  },
  {
    name: 'list_discussion_sessions',
    description:
      'List completed student sessions for a discussion bot I own (student, section, message count).',
    schema: z.object({ discussionId: z.string().uuid() }),
    scope: 'read',
    handler: async (args, ctx) => ({
      sessions: await listDiscussionSessions(
        ctx.auth.user,
        args.discussionId as string,
      ),
    }),
  },
  {
    name: 'get_discussion_session',
    description:
      'Full transcript of one student discussion session. Education-record access (audited).',
    schema: z.object({ sessionId: z.string().uuid() }),
    scope: 'read',
    handler: (args, ctx) =>
      getDiscussionSession(ctx.auth.user, args.sessionId as string),
  },

  // ---- Materials (Knowledge) ------------------------------------------
  {
    name: 'list_teachable_courses',
    description:
      'List courses I teach (via section enrollment), for choosing a materials library.',
    schema: z.object({}),
    scope: 'read',
    handler: async (_args, ctx) => ({
      courses: await listTeachableCourses(ctx.auth.user),
    }),
  },
  {
    name: 'list_materials',
    description:
      'List course materials and attached workspace Knowledge documents for a course I can manage.',
    schema: z.object({ courseId: z.string().uuid() }),
    scope: 'read',
    handler: async (args, ctx) => {
      const courseId = args.courseId as string;
      const [materials, documents] = await Promise.all([
        listCourseMaterials(ctx.auth.user, courseId),
        listCourseLinkedDocuments(ctx.auth.user, courseId),
      ]);
      return { materials, documents };
    },
  },
  {
    name: 'attach_knowledge_document',
    description:
      'Attach a workspace Knowledge document to a course for RAG (tutor + authoring).',
    schema: z.object({
      courseId: z.string().uuid(),
      documentId: z.string().uuid(),
    }),
    scope: 'materials:write',
    handler: async (args, ctx) => {
      await linkDocumentToCourse(
        ctx.auth.user,
        args.courseId as string,
        args.documentId as string,
      );
      return { success: true };
    },
  },
  {
    name: 'detach_knowledge_document',
    description:
      'Detach a workspace Knowledge document from a course (document remains in the library).',
    schema: z.object({
      courseId: z.string().uuid(),
      documentId: z.string().uuid(),
      confirm: confirmField,
    }),
    scope: 'materials:write',
    destructive: true,
    handler: async (args, ctx) => {
      await unlinkDocumentFromCourse(
        ctx.auth.user,
        args.courseId as string,
        args.documentId as string,
      );
      return { success: true };
    },
  },
  {
    name: 'get_material',
    description: 'Get one course material by id (metadata; not file bytes).',
    schema: z.object({ materialId: z.string().uuid() }),
    scope: 'read',
    handler: async (args, ctx) => ({
      material: await getCourseMaterial(
        ctx.auth.user,
        args.materialId as string,
      ),
    }),
  },
  {
    name: 'add_material_url',
    description:
      'Add a public http(s) URL to a course materials library I teach. Indexes asynchronously.',
    schema: z.object({
      courseId: z.string().uuid(),
      url: z.string().url(),
      title: z.string().min(1).max(200).optional(),
    }),
    scope: 'materials:write',
    handler: (args, ctx) =>
      addMaterialFromUrl(ctx.auth.user, {
        courseId: args.courseId as string,
        url: args.url as string,
        title: args.title as string | undefined,
      }),
  },
  {
    name: 'delete_material',
    description:
      'Soft-delete a course material (removed from tutor retrieval). Destructive; requires confirm.',
    schema: z.object({
      materialId: z.string().uuid(),
      confirm: confirmField,
    }),
    scope: 'materials:write',
    destructive: true,
    handler: async (args, ctx) => {
      await softDeleteMaterial(ctx.auth.user, args.materialId as string);
      return { success: true };
    },
  },

  // ---- Authoring ------------------------------------------------------
  {
    name: 'search_course_materials',
    description:
      'Semantic search over indexed course material chunks (faculty authoring context; not student tutor).',
    schema: z.object({
      courseId: z.string().uuid(),
      query: z.string().min(1).max(2000),
      k: z.number().int().min(1).max(20).optional(),
    }),
    scope: 'authoring:write',
    handler: async (args, ctx) => {
      await assertCanManageCourse(ctx.auth.user, args.courseId as string);
      const chunks = await searchCourseMaterialsForAuthoring(
        args.courseId as string,
        args.query as string,
        { k: args.k as number | undefined },
      );
      return { chunks };
    },
  },
  {
    name: 'list_outlines',
    description: 'List non-archived authoring outlines for a course I teach.',
    schema: z.object({ courseId: z.string().uuid() }),
    scope: 'read',
    handler: async (args, ctx) => ({
      outlines: await listOutlinesForCourse(
        ctx.auth.user,
        args.courseId as string,
      ),
    }),
  },
  {
    name: 'list_lessons',
    description:
      'List published lessons for a course I teach (active and inactive drafts).',
    schema: z.object({ courseId: z.string().uuid() }),
    scope: 'read',
    handler: async (args, ctx) => {
      await assertCanManageCourse(ctx.auth.user, args.courseId as string);
      const rows = await db.query.lessons.findMany({
        where: and(
          eq(lessons.courseId, args.courseId as string),
          isNull(lessons.deletedAt),
        ),
        orderBy: [desc(lessons.updatedAt)],
        columns: {
          id: true,
          title: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return { lessons: rows };
    },
  },
  {
    name: 'get_concept_mastery',
    description:
      'Concept mastery and gaps for a course I teach (from quiz question tags + submitted attempts). Optional sectionId filter.',
    schema: z.object({
      courseId: z.string().uuid(),
      sectionId: z.string().uuid().optional(),
    }),
    scope: 'read',
    handler: async (args, ctx) => {
      const result = await getConceptMastery(
        ctx.auth.user,
        args.courseId as string,
        { sectionId: args.sectionId as string | undefined },
      );
      await logAudit({
        actorUserId: ctx.auth.user.id,
        actorClerkId: ctx.auth.user.clerkId,
        action: 'professor.analytics.view',
        targetType: 'course',
        targetId: args.courseId as string,
        metadata: {
          tool: 'get_concept_mastery',
          sectionId: (args.sectionId as string | undefined) ?? null,
          conceptCount: result.concepts.length,
        },
      });
      return result;
    },
  },
  {
    name: 'get_lesson_completion',
    description:
      'Lesson completion rates for a course I teach (started / completed vs roster). Optional sectionId filter.',
    schema: z.object({
      courseId: z.string().uuid(),
      sectionId: z.string().uuid().optional(),
    }),
    scope: 'read',
    handler: async (args, ctx) => {
      const lessonsRows = await getLessonCompletion(
        ctx.auth.user,
        args.courseId as string,
        { sectionId: args.sectionId as string | undefined },
      );
      await logAudit({
        actorUserId: ctx.auth.user.id,
        actorClerkId: ctx.auth.user.clerkId,
        action: 'professor.analytics.view',
        targetType: 'course',
        targetId: args.courseId as string,
        metadata: {
          tool: 'get_lesson_completion',
          sectionId: (args.sectionId as string | undefined) ?? null,
          lessonCount: lessonsRows.length,
        },
      });
      return { lessons: lessonsRows };
    },
  },
  {
    name: 'get_outline',
    description:
      'Get the current or a specific course authoring outline (modules and items).',
    schema: z.object({
      outlineId: z.string().uuid().optional(),
      courseId: z.string().uuid().optional(),
    }),
    scope: 'read',
    handler: async (args, ctx) => {
      if (args.outlineId) {
        return {
          outline: await getOutlineDetail(
            ctx.auth.user,
            args.outlineId as string,
          ),
        };
      }
      if (!args.courseId) {
        throw ApiError.badRequest('outlineId or courseId is required');
      }
      return {
        outline: await getCurrentOutlineForCourse(
          ctx.auth.user,
          args.courseId as string,
        ),
      };
    },
  },
  {
    name: 'propose_outline',
    description:
      'Propose an outline SKELETON from READY materials (prior-course tagged materials mirror last term). Does not build assignment bodies until approve_outline.',
    schema: z.object({
      courseId: z.string().uuid(),
      brief: z.string().max(2000).optional(),
    }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      proposeOutlineSkeleton(ctx.auth.user, {
        courseId: args.courseId as string,
        brief: args.brief as string | undefined,
      }),
  },
  {
    name: 'approve_outline',
    description:
      'Approve a DRAFT skeleton and faithfully build assignment bodies (mimics prior-course materials when tagged).',
    schema: z.object({ outlineId: z.string().uuid() }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      approveAndBuildOutline(ctx.auth.user, args.outlineId as string),
  },
  {
    name: 'generate_outline',
    description:
      'One-shot full outline generate (secondary). Prefer propose_outline + approve_outline. Archives the previous current outline.',
    schema: z.object({
      courseId: z.string().uuid(),
      brief: z.string().max(2000).optional(),
    }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      generateCourseOutline(ctx.auth.user, {
        courseId: args.courseId as string,
        brief: args.brief as string | undefined,
      }),
  },
  {
    name: 'list_outline_revisions',
    description: 'List authoring revisions for an outline (for rollback).',
    schema: z.object({ outlineId: z.string().uuid() }),
    scope: 'read',
    handler: async (args, ctx) => ({
      revisions: await listAuthoringRevisions(
        ctx.auth.user,
        args.outlineId as string,
      ),
    }),
  },
  {
    name: 'restore_outline_revision',
    description: 'Restore an outline to a prior revision snapshot.',
    schema: z.object({ revisionId: z.string().uuid() }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      restoreAuthoringRevision(ctx.auth.user, args.revisionId as string),
  },
  {
    name: 'propose_switch_up',
    description:
      'Propose anti-cheat assignment variants (same structure, new questions) with similarity scores. Does not apply until accept_switch_up.',
    schema: z.object({
      outlineId: z.string().uuid(),
      itemIds: z.array(z.string().uuid()).optional(),
    }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      proposeSwitchUp(ctx.auth.user, {
        outlineId: args.outlineId as string,
        itemIds: args.itemIds as string[] | undefined,
      }),
  },
  {
    name: 'accept_switch_up',
    description: 'Apply accepted switch-up item bodies to the outline.',
    schema: z.object({
      outlineId: z.string().uuid(),
      items: z.array(
        z.object({
          itemId: z.string().uuid(),
          title: z.string().optional(),
          body: z.record(z.string(), z.unknown()),
        }),
      ),
    }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      acceptSwitchUp(ctx.auth.user, {
        outlineId: args.outlineId as string,
        items: args.items as Parameters<typeof acceptSwitchUp>[1]['items'],
      }),
  },
  {
    name: 'rollover_checks',
    description:
      'SOL-native pre-publish checks: stale/missing dates, duplicates, inactive quizzes, missing-work zeros.',
    schema: z.object({ courseId: z.string().uuid() }),
    scope: 'read',
    handler: (args, ctx) =>
      runRolloverChecks(ctx.auth.user, args.courseId as string),
  },
  {
    name: 'update_outline',
    description: 'Update outline title or status (DRAFT/READY/ARCHIVED).',
    schema: z.object({
      outlineId: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      status: z.enum(['DRAFT', 'READY', 'ARCHIVED']).optional(),
    }),
    scope: 'authoring:write',
    handler: async (args, ctx) => {
      if (args.status === 'ARCHIVED' && args.title == null) {
        return archiveOutline(ctx.auth.user, args.outlineId as string);
      }
      return updateOutlineMeta(ctx.auth.user, args.outlineId as string, {
        title: args.title as string | undefined,
        status: args.status as 'DRAFT' | 'READY' | 'ARCHIVED' | undefined,
      });
    },
  },
  {
    name: 'update_outline_item',
    description: 'Manually edit an outline item title or body JSON.',
    schema: z.object({
      itemId: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
    }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      updateOutlineItem(ctx.auth.user, args.itemId as string, {
        title: args.title as string | undefined,
        body: args.body as Parameters<typeof updateOutlineItem>[2]['body'],
      }),
  },
  {
    name: 'refine_outline',
    description:
      'Chat-refine an outline: natural-language edit that may patch item bodies.',
    schema: z.object({
      outlineId: z.string().uuid(),
      message: z.string().min(1).max(4000),
      focusItemId: z.string().uuid().optional(),
    }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      refineOutlineChat(ctx.auth.user, {
        outlineId: args.outlineId as string,
        message: args.message as string,
        focusItemId: args.focusItemId as string | undefined,
      }),
  },
  {
    name: 'preview_outline_item',
    description:
      'Mark an item PREVIEW and return a preview DTO. mode=student strips answer keys (no grade write).',
    schema: z.object({
      itemId: z.string().uuid(),
      mode: z.enum(['faculty', 'student']).optional(),
    }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      previewOutlineItem(ctx.auth.user, args.itemId as string, {
        mode: args.mode as 'faculty' | 'student' | undefined,
      }),
  },
  {
    name: 'publish_outline_item',
    description:
      'Create an inactive quiz or discussion from a QUIZ/DISCUSSION item (not visible to students until release).',
    schema: z.object({
      itemId: z.string().uuid(),
      sectionIds: z.array(z.string().uuid()).optional(),
    }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      publishOutlineItem(ctx.auth.user, args.itemId as string, {
        sectionIds: args.sectionIds as string[] | undefined,
      }),
  },
  {
    name: 'release_outline_item',
    description:
      'Release a published outline item to students (sets linked quiz/discussion isActive true).',
    schema: z.object({ itemId: z.string().uuid() }),
    scope: 'authoring:write',
    handler: (args, ctx) =>
      releaseOutlineItem(ctx.auth.user, args.itemId as string),
  },
];

export const MCP_TOOLS_BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t]));
