import type { ChatbotMessage } from '@/app/db/schema';
import type { CoursePromptContext } from '@/lib/ai/prompts/courseContext';
import { temperatureForModel } from '@/lib/ai/modelRouter';
import { logAiSpan } from '@/lib/ai/tracing';
import { aiClientFor } from '@/lib/ai/gateway';
import { CHATBOT_MODEL } from '@/lib/chatbot/client';
import {
  assembleSystemPrompt,
  buildSafeQuizContext,
  scrubAssistantReply,
  toOpenAiMessages,
  type SafeQuizInput,
} from '@/lib/chatbot/safeQuizContext';

export type ChatbotRespondResult =
  | { ok: true; text: string }
  | {
      ok: false;
      reason: 'no_api_key' | 'empty_response' | 'openai_timeout' | 'openai_error';
      message: string;
    };

export type ChatbotStreamResult =
  | {
      ok: true;
      stream: AsyncIterable<string>;
    }
  | {
      ok: false;
      reason: 'no_api_key' | 'openai_timeout' | 'openai_error';
      message: string;
    };

function buildMessages(opts: {
  professorSystemPrompt: string;
  quiz: SafeQuizInput | null;
  history: ChatbotMessage[];
  userMessage: string;
  materialsContext?: string;
  lessonsContext?: string;
  tutorPolicyRules?: string;
  courseCtx?: CoursePromptContext;
  assessmentLocked?: boolean;
}) {
  const safeQuiz = buildSafeQuizContext(opts.quiz);
  const systemContent = assembleSystemPrompt(
    opts.professorSystemPrompt,
    safeQuiz,
    opts.materialsContext ?? '',
    opts.lessonsContext ?? '',
    opts.tutorPolicyRules ?? '',
    {
      courseCtx: opts.courseCtx,
      assessmentLocked: opts.assessmentLocked,
    },
  );
  return toOpenAiMessages(systemContent, opts.history, opts.userMessage);
}

function mapOpenAiError(err: unknown): {
  reason: 'openai_timeout' | 'openai_error';
  message: string;
} {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const isTimeout =
    /timeout|timed out|AbortError/i.test(message) ||
    (err as { code?: string })?.code === 'ETIMEDOUT';
  return {
    reason: isTimeout ? 'openai_timeout' : 'openai_error',
    message: isTimeout
      ? 'The assistant timed out. Please try again.'
      : 'The assistant failed to respond. Please try again.',
  };
}

/** Non-streaming reply (kept for tests / fallbacks). */
export async function generateChatbotReply(opts: {
  professorSystemPrompt: string;
  quiz: SafeQuizInput | null;
  history: ChatbotMessage[];
  userMessage: string;
  model?: string;
  /** Optional course-materials excerpts (already budgeted / safe). */
  materialsContext?: string;
  /** Optional released-lesson excerpts (already budgeted / safe). */
  lessonsContext?: string;
  tutorPolicyRules?: string;
  courseCtx?: CoursePromptContext;
  assessmentLocked?: boolean;
}): Promise<ChatbotRespondResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: 'no_api_key',
      message: 'Chat is temporarily unavailable (missing API key).',
    };
  }

  const messages = buildMessages(opts);

  try {
    const model = opts.model ?? CHATBOT_MODEL;
    const temperature = temperatureForModel(model, 0.5);
    const client = await aiClientFor(
      'tutor',
      { courseId: opts.courseCtx?.courseId ?? null },
      { maxRetries: 2, timeout: 20_000 },
    );
    const completion = await client.chat.completions.create({
      model,
      ...(temperature != null ? { temperature } : {}),
      max_completion_tokens: 800,
      messages,
    } as never);

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      void logAiSpan(
        'chatbotReply',
        'chatbot',
        {
          model: opts.model ?? CHATBOT_MODEL,
          stream: false,
          status: 'empty_response',
        },
        { isFailure: true },
      );
      return {
        ok: false,
        reason: 'empty_response',
        message: 'The assistant returned an empty reply. Please try again.',
      };
    }
    const scrubbed = scrubAssistantReply(text);
    void logAiSpan(
      'chatbotReply',
      'chatbot',
      {
        model: opts.model ?? CHATBOT_MODEL,
        stream: false,
        status: 'ok',
        leakScrubApplied: scrubbed !== text,
      },
      { isFailure: false },
    );
    return { ok: true, text: scrubbed };
  } catch (err: unknown) {
    const mapped = mapOpenAiError(err);
    void logAiSpan(
      'chatbotReply',
      'chatbot',
      {
        model: opts.model ?? CHATBOT_MODEL,
        stream: false,
        status: mapped.reason,
      },
      { isFailure: true },
    );
    return { ok: false, ...mapped };
  }
}

/** Streaming reply: yields text deltas as they arrive from OpenAI. */
export async function streamChatbotReply(opts: {
  professorSystemPrompt: string;
  quiz: SafeQuizInput | null;
  history: ChatbotMessage[];
  userMessage: string;
  model?: string;
  materialsContext?: string;
  lessonsContext?: string;
  tutorPolicyRules?: string;
  courseCtx?: CoursePromptContext;
  assessmentLocked?: boolean;
}): Promise<ChatbotStreamResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: 'no_api_key',
      message: 'Chat is temporarily unavailable (missing API key).',
    };
  }

  const messages = buildMessages(opts);

  try {
    const model = opts.model ?? CHATBOT_MODEL;
    const temperature = temperatureForModel(model, 0.5);
    const client = await aiClientFor(
      'tutor',
      { courseId: opts.courseCtx?.courseId ?? null },
      { maxRetries: 2, timeout: 20_000 },
    );
    const completion = await client.chat.completions.create({
      model,
      ...(temperature != null ? { temperature } : {}),
      max_completion_tokens: 800,
      messages,
      stream: true,
    } as never);

    // `as never` above keeps create() loosely typed; stream:true yields chunks.
    const stream = completion as unknown as AsyncIterable<{
      choices?: Array<{ delta?: { content?: string | null } }>;
    }>;

    async function* deltas(): AsyncIterable<string> {
      for await (const chunk of stream) {
        const piece = chunk.choices?.[0]?.delta?.content;
        if (piece) yield piece;
      }
    }

    return { ok: true, stream: deltas() };
  } catch (err: unknown) {
    const mapped = mapOpenAiError(err);
    void logAiSpan(
      'chatbotReply',
      'chatbot',
      {
        model: opts.model ?? CHATBOT_MODEL,
        stream: true,
        status: mapped.reason,
      },
      { isFailure: true },
    );
    return { ok: false, ...mapped };
  }
}

/** Re-export scrub for the streaming route (full reply checked after stream). */
export { scrubAssistantReply };
