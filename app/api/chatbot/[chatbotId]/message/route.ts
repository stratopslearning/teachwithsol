import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import type { ChatbotMessage } from '@/app/db/schema';
import {
  countRecentStuckSignals,
  INSTRUCTOR_ESCALATION_OFFER,
  resolveTutorAiPolicy,
  tutorPolicySystemRules,
  userRequestedInstructorEscalation,
} from '@/lib/chatbot/aiPolicy';
import {
  getActiveChatbot,
  loadSafeQuizForChatbot,
  studentCanAccessChatbot,
} from '@/lib/chatbot/access';
import { fetchSectionById } from '@/lib/db/entityScopedReads';
import {
  fetchChatbotSessionByIdDefiner,
  updateChatbotSessionDefiner,
} from '@/lib/db/studentWriteDefiners';
import {
  extractStruggleTopics,
  NOT_IN_MATERIALS_REPLY,
  shouldLockQuizContext,
} from '@/lib/chatbot/assessmentLock';
import {
  MAX_SESSION_TURNS,
  MAX_USER_MESSAGE_CHARS,
  TUTOR_PROMPT_VERSION,
} from '@/lib/chatbot/constants';
import { streamChatbotReply, scrubAssistantReply } from '@/lib/chatbot/respond';
import { resolveModel } from '@/lib/ai/modelRouter';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { tenantRateLimitKey } from '@/lib/rateLimit';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { sanitizeStoredText } from '@/lib/api/sanitizeStoredText';
import { isStudentEntitled } from '@/lib/featureFlags';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import {
  buildCitationFootnotes,
  buildSafeMaterialsContext,
  retrieveCourseChunks,
} from '@/lib/knowledge';
import { buildSafeLessonsContext } from '@/lib/learning';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(MAX_USER_MESSAGE_CHARS),
});

type SseEvent =
  | { type: 'token'; text: string }
  | { type: 'done'; reply: string; messages: ChatbotMessage[] }
  | { type: 'error'; message: string };

function encodeSse(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isStudentEntitled(user)) {
      return NextResponse.json({ error: 'Payment required' }, { status: 402 });
    }

    const { chatbotId } = await context.params;
    const body = bodySchema.parse(await readJsonBody(req));

    const bot = await getActiveChatbot(chatbotId);
    if (!bot || bot.isTemplate) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const canAccess = await studentCanAccessChatbot(user.id, chatbotId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const session = await fetchChatbotSessionByIdDefiner(
      body.sessionId,
      user.id,
      chatbotId,
    );

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const limited = await enforceRateLimit({
      key: tenantRateLimitKey(session.tenantId, user.id, 'chatbot-msg'),
      limit: 40,
      windowMs: 5 * 60_000,
      prefix: 'rl',
      message: 'Too many chat messages. Please wait a moment.',
    });
    if (limited) return limited;

    if (session.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'This discussion is already completed' },
        { status: 400 },
      );
    }

    const history = (session.messages ?? []) as ChatbotMessage[];
    const userTurns = history.filter((m) => m.role === 'user').length;
    if (userTurns >= MAX_SESSION_TURNS) {
      return NextResponse.json(
        {
          error:
            'This discussion has reached the maximum number of turns. Please complete it.',
        },
        { status: 400 },
      );
    }

    const assessmentLocked = await shouldLockQuizContext({
      studentId: user.id,
      relatedQuizId: bot.relatedQuizId,
      sectionId: session.sectionId,
    });
    // Hard lock: omit quiz stems/keys entirely during an active attempt.
    const quiz = assessmentLocked
      ? null
      : await loadSafeQuizForChatbot(bot.relatedQuizId);
    const userText = sanitizeStoredText(body.message);
    const struggleTopics = extractStruggleTopics(userText);

    // Ground in course materials + released lessons; never fail the chat on RAG errors.
    let materialsContext = '';
    let lessonsContext = '';
    let hadRetrievalHits = false;
    try {
      const section = await fetchSectionById(session.sectionId);
      if (section?.courseId) {
        const tenantId = section.tenantId ?? section.workspaceId;
        if (!tenantId) throw new Error('section missing tenant');
        const chunks = await retrieveCourseChunks(section.courseId, userText, {
          tenantId,
          offeringId: section.offeringId,
        });
        hadRetrievalHits = chunks.length > 0;
        const footnotes = buildCitationFootnotes(chunks);
        materialsContext = [
          buildSafeMaterialsContext(chunks),
          footnotes,
          hadRetrievalHits
            ? 'CITATION RULE: Cite sources from the footnotes when you use materials. If nothing relevant is present, say it is not in the course materials and offer to flag the instructor.'
            : 'CITATION RULE: Retrieval found no matching course materials. Tell the student this is not in their course materials and offer to flag the instructor. Do not invent sources.',
        ]
          .filter(Boolean)
          .join('\n\n');
        lessonsContext = await buildSafeLessonsContext(
          section.courseId,
          userText,
          { sectionId: session.sectionId },
        );
      }
    } catch (err) {
      console.error('materials/lessons grounding skipped', err);
    }

    // Fast-path when retrieval is empty: fixed reply (still allow streaming path for policy).
    const forceNotInMaterials = !hadRetrievalHits && !lessonsContext.trim();

    let tutorWorkspaceId: string | null = null;
    const sessionSection = await fetchSectionById(session.sectionId);
    try {
      if (sessionSection?.courseId) {
        const { getCourseWorkspaceId, checkAiBandAvailable } = await import(
          '@/lib/workspace'
        );
        tutorWorkspaceId = await getCourseWorkspaceId(sessionSection.courseId);
        const cap = await checkAiBandAvailable(tutorWorkspaceId);
        if (!cap.ok) {
          return NextResponse.json(
            {
              error: cap.reason,
              code: 'ai_band_exceeded',
              used: cap.used,
              cap: cap.cap,
            },
            { status: 429 },
          );
        }
      }
    } catch (err) {
      console.warn('[chatbot/message] AI cap check failed', err);
    }

    let tutorPolicyRules = tutorPolicySystemRules(
      resolveTutorAiPolicy({ chatbotPolicy: bot.aiPolicy }),
    );
    let courseCtx: Awaited<
      ReturnType<typeof import('@/lib/ai/prompts/courseContext').loadCoursePromptContext>
    > | undefined;
    try {
      if (sessionSection?.courseId) {
        const { loadCoursePromptContext } = await import(
          '@/lib/ai/prompts/courseContext'
        );
        const { fetchCourseById } = await import('@/lib/db/entityScopedReads');
        courseCtx = await loadCoursePromptContext(sessionSection.courseId);
        const course = await fetchCourseById(sessionSection.courseId);
        tutorPolicyRules = tutorPolicySystemRules(
          resolveTutorAiPolicy({
            chatbotPolicy: bot.aiPolicy,
            coursePolicy: course?.aiPolicy,
          }),
        );
      }
    } catch {
      /* policy lookup is best-effort */
    }

    const escalationRequested = userRequestedInstructorEscalation(userText);
    const stuckCount = countRecentStuckSignals(history);
    const offerEscalation =
      escalationRequested || stuckCount >= 3;

    const tutorModel = bot.model || resolveModel('tutor').model;

    if (forceNotInMaterials) {
      const now = new Date().toISOString();
      let reply = NOT_IN_MATERIALS_REPLY;
      if (offerEscalation) {
        reply = `${reply}\n\n${INSTRUCTOR_ESCALATION_OFFER}`;
      }
      const nextMessages: ChatbotMessage[] = [
        ...history,
        { role: 'user', content: userText, at: now },
        { role: 'assistant', content: reply, at: now },
      ];
      const priorTopics = Array.isArray(session.struggleTopics)
        ? (session.struggleTopics as string[])
        : [];
      const mergedTopics = [
        ...new Set([...priorTopics, ...struggleTopics]),
      ].slice(0, 40);
      await updateChatbotSessionDefiner({
        sessionId: session.id,
        studentId: user.id,
        messages: nextMessages,
        struggleTopics: mergedTopics,
        sessionMetadata: {
          ...((session.sessionMetadata as Record<string, unknown>) ?? {}),
          citationStatus: 'not_in_materials',
          promptVersion: TUTOR_PROMPT_VERSION,
          modelVersion: tutorModel,
          assessmentLocked,
        },
      });

      const encoder = new TextEncoder();
      const readable = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(encodeSse({ type: 'token', text: reply })),
          );
          controller.enqueue(
            encoder.encode(
              encodeSse({ type: 'done', reply, messages: nextMessages }),
            ),
          );
          controller.close();
        },
      });
      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const streamed = await streamChatbotReply({
      professorSystemPrompt: bot.systemPrompt,
      quiz,
      history,
      userMessage: userText,
      model: tutorModel,
      materialsContext,
      lessonsContext,
      tutorPolicyRules,
      courseCtx,
      assessmentLocked,
    });

    if (!streamed.ok) {
      const status = streamed.reason === 'no_api_key' ? 503 : 502;
      return NextResponse.json({ error: streamed.message }, { status });
    }

    void (async () => {
      try {
        if (!sessionSection?.courseId) return;
        const { getCourseWorkspaceId, recordAiUsage } = await import(
          '@/lib/workspace'
        );
        const workspaceId = await getCourseWorkspaceId(sessionSection.courseId);
        if (workspaceId) await recordAiUsage(workspaceId, 'tutor', 1);
      } catch (err) {
        console.warn('[chatbot/message] usage meter failed', err);
      }
    })();

    const encoder = new TextEncoder();
    const openaiStream = streamed.stream;
    const sessionId = session.id;

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        let full = '';
        try {
          for await (const piece of openaiStream) {
            full += piece;
            controller.enqueue(
              encoder.encode(encodeSse({ type: 'token', text: piece })),
            );
          }

          const rawReply = full.trim();
          if (!rawReply) {
            controller.enqueue(
              encoder.encode(
                encodeSse({
                  type: 'error',
                  message:
                    'The assistant returned an empty reply. Please try again.',
                }),
              ),
            );
            controller.close();
            return;
          }

          // Post-stream leak scrub: persist + done use the safe reply even if
          // progressive tokens already streamed (client should prefer `done`).
          let reply = scrubAssistantReply(rawReply);
          if (offerEscalation && !reply.includes('flag instructor')) {
            reply = `${reply}\n\n${INSTRUCTOR_ESCALATION_OFFER}`;
          }

          const now = new Date().toISOString();
          const nextMessages: ChatbotMessage[] = [
            ...history,
            { role: 'user', content: userText, at: now },
            { role: 'assistant', content: reply, at: now },
          ];

          const priorMeta =
            (session.sessionMetadata as Record<string, unknown>) ?? {};
          const sessionMetadata = {
            ...priorMeta,
            citationStatus: hadRetrievalHits ? 'cited' : 'unknown',
            promptVersion: TUTOR_PROMPT_VERSION,
            modelVersion: tutorModel,
            assessmentLocked,
            ...(escalationRequested
              ? {
                  escalated: true,
                  instructorEscalationRequested: true,
                  instructorEscalationAt: now,
                  escalatedAt: now,
                }
              : {}),
          };
          const priorTopics = Array.isArray(session.struggleTopics)
            ? (session.struggleTopics as string[])
            : [];
          const mergedTopics = [
            ...new Set([...priorTopics, ...struggleTopics]),
          ].slice(0, 40);

          await updateChatbotSessionDefiner({
            sessionId,
            studentId: user.id,
            messages: nextMessages,
            sessionMetadata,
            struggleTopics: mergedTopics,
          });

          controller.enqueue(
            encoder.encode(
              encodeSse({
                type: 'done',
                reply,
                messages: nextMessages,
              }),
            ),
          );
          controller.close();
        } catch (err) {
          console.error('Chatbot stream error:', err);
          controller.enqueue(
            encoder.encode(
              encodeSse({
                type: 'error',
                message: 'The assistant failed to respond. Please try again.',
              }),
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Chatbot message error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 },
    );
  }
}
