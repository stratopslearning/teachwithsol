/**
 * Post-session struggle topic tagger (async). Heuristic tags remain the
 * fallback when OPENAI_API_KEY is missing.
 */
import { z } from 'zod';

import type { ChatbotMessage } from '@/app/db/schema';
import { getAiClientForTask, resolveModel } from '@/lib/ai/gateway';
import {
  defaultCoursePromptContext,
  loadCoursePromptContext,
} from '@/lib/ai/prompts/courseContext';
import {
  buildStruggleTaggerSystemPrompt,
  buildStruggleTaggerUserPrompt,
  STRUGGLE_TAGGER_PROMPT_VERSION,
} from '@/lib/ai/prompts/struggleTagger';
import { completeJsonSchema } from '@/lib/ai/structured';
import { hashId, logAiSpan } from '@/lib/ai/tracing';
import { extractStruggleTopics } from '@/lib/chatbot/assessmentLock';
import {
  fetchChatbotSessionByIdDefiner,
  updateChatbotSessionDefiner,
} from '@/lib/db/studentWriteDefiners';

const struggleZod = z.object({
  topics: z.array(z.string().min(1).max(80)).max(20),
  escalated: z.boolean(),
  not_covered: z.array(z.string().min(1).max(80)).max(20).optional(),
});

const struggleJsonSchema = {
  type: 'object' as const,
  properties: {
    topics: { type: 'array', items: { type: 'string' } },
    escalated: { type: 'boolean' },
    not_covered: { type: 'array', items: { type: 'string' } },
  },
  required: ['topics', 'escalated'],
  additionalProperties: false,
};

function transcriptFromMessages(messages: ChatbotMessage[]): string {
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n')
    .slice(0, 12_000);
}

/**
 * Tag struggles for a completed chatbot session and persist to struggle_topics.
 * Safe to fire-and-forget; never throws to the caller.
 */
export async function tagSessionStruggles(opts: {
  sessionId: string;
  studentId: string;
  courseId?: string | null;
  courseTopics?: string[];
}): Promise<{ topics: string[]; escalated: boolean } | null> {
  try {
    const session = await fetchChatbotSessionByIdDefiner(
      opts.sessionId,
      opts.studentId,
    );
    if (!session) return null;

    const messages = (session.messages ?? []) as ChatbotMessage[];
    const heuristic = extractStruggleTopics(
      messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join('\n'),
    );

    let topics = heuristic;
    let escalated = false;
    let notCovered: string[] = [];

    if (process.env.OPENAI_API_KEY && messages.length > 0) {
      const ctx = opts.courseId
        ? await loadCoursePromptContext(opts.courseId).catch(() =>
            defaultCoursePromptContext(),
          )
        : defaultCoursePromptContext();
      const client = getAiClientForTask('insights', { timeout: 45_000 });
      const resolved = resolveModel('insights');
      const result = await completeJsonSchema({
        client,
        task: 'insights',
        model: resolved.model,
        messages: [
          {
            role: 'system',
            content: buildStruggleTaggerSystemPrompt(ctx),
          },
          {
            role: 'user',
            content: buildStruggleTaggerUserPrompt({
              topics: opts.courseTopics ?? [],
              transcript: transcriptFromMessages(messages),
            }),
          },
        ],
        schemaName: 'struggle_tags',
        jsonSchema: struggleJsonSchema,
        zodSchema: struggleZod,
        maxCompletionTokens: 800,
        temperature: 0.2,
        promptVersion: STRUGGLE_TAGGER_PROMPT_VERSION,
      });
      if (result.ok) {
        topics = result.value.topics.slice(0, 20);
        escalated = result.value.escalated;
        notCovered = result.value.not_covered ?? [];
      }
    }

    const prior = Array.isArray(session.struggleTopics)
      ? (session.struggleTopics as string[])
      : [];
    const merged = [...new Set([...prior, ...topics])].slice(0, 40);

    await updateChatbotSessionDefiner({
      sessionId: opts.sessionId,
      studentId: opts.studentId,
      struggleTopics: merged,
      sessionMetadata: {
        ...((session.sessionMetadata as Record<string, unknown>) ?? {}),
        struggleTagger: {
          promptVersion: STRUGGLE_TAGGER_PROMPT_VERSION,
          escalated,
          notCovered,
          taggedAt: new Date().toISOString(),
        },
      },
    });

    void logAiSpan('insights.struggle_tagger', 'insights', {
      sessionId: hashId(opts.sessionId),
      topicCount: merged.length,
      escalated,
    });

    return { topics: merged, escalated };
  } catch (err) {
    console.warn('[struggleTagger] failed', err);
    return null;
  }
}
