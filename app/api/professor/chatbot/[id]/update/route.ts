import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { fetchChatbotByIdDefiner } from '@/lib/db/studentReadDefiners';
import { withTenant } from '@/lib/db/tenantContext';
import { chatbots } from '@/app/db/schema';
import { userCanWriteChatbot } from '@/lib/chatbot/access';
import { ApiError, apiErrorResponse, jsonError } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { updateDiscussion } from '@/lib/professor/mutations';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  personaName: z.string().min(1).max(100).optional(),
  instructions: z.string().min(1).max(10_000).optional(),
  systemPrompt: z.string().min(1).max(50_000).optional(),
  relatedQuizId: z.string().uuid().nullable().optional(),
  sectionIds: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().optional(),
  aiPolicy: z
    .object({
      mode: z.enum(['hints', 'guided', 'full_after_submit']),
    })
    .nullable()
    .optional(),
});

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireProfessorApi(req, {
      scope: 'discussions:write',
    });

    const limited = await enforceRateLimit({
      key: `chatbot-update:${user.id}`,
      limit: 40,
      windowMs: 60_000,
      prefix: 'rl',
      message: 'Too many update requests. Please wait a moment.',
    });
    if (limited) return limited;

    const { id } = await context.params;
    const body = updateSchema.parse(await readJsonBody(req));
    await updateDiscussion(user, id, body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Chatbot update error:', error);
    if (error instanceof ApiError) return jsonError(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'Failed to update discussion' },
      { status: 500 },
    );
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    ({ user } = await requireProfessorApi(_req, { scope: 'read' }));
  } catch (error) {
    return apiErrorResponse(error);
  }

  const { id } = await context.params;
  // FORCE RLS: a plain db read finds nothing; read under the bot's tenant.
  const meta = await fetchChatbotByIdDefiner(id);
  const bot = meta?.tenantId
    ? await withTenant(meta.tenantId, user.id, (tx) =>
        tx.query.chatbots.findFirst({
          where: eq(chatbots.id, id),
          with: { sectionAssignments: true, relatedQuiz: true },
        }),
      )
    : undefined;
  if (!bot) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!bot.isTemplate && !(await userCanWriteChatbot(user, bot))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    chatbot: {
      id: bot.id,
      title: bot.title,
      description: bot.description,
      personaName: bot.personaName,
      instructions: bot.instructions,
      systemPrompt: bot.systemPrompt,
      relatedQuizId: bot.relatedQuizId,
      relatedQuizTitle: bot.relatedQuiz?.title ?? null,
      isTemplate: bot.isTemplate,
      sectionIds: bot.sectionAssignments.map((s) => s.sectionId),
    },
  });
}
