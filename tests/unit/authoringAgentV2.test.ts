/**
 * Authoring agent v2, driven by a scripted model. Cases come from real prod
 * conversations where the old agent misbehaved (2026-11-05 → 11-23).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Script = Array<
  | { tool: string; args?: Record<string, unknown> }
  | { text: string }
>;

const m = vi.hoisted(() => ({
  script: [] as Array<Array<{ tool: string; args?: Record<string, unknown> }> | { text: string }>,
  toolMessages: [] as string[],
  history: [] as Array<{ id: string; role: string; content: string; createdAt: Date }>,
  inserted: [] as Array<{ role: string; content: string }>,
  executeToolCall: vi.fn(),
  createOutlineItem: vi.fn(),
  generateItemBody: vi.fn(),
  createRevision: vi.fn(async () => ({ id: 'rev1' })),
}));

const ITEMS = [
  { id: '11111111-1111-4111-8111-111111111111', type: 'QUIZ', title: 'UNIX Process Tree', published: true },
  { id: '22222222-2222-4222-8222-222222222222', type: 'QUIZ', title: 'Virtual Memory', published: true },
  { id: '33333333-3333-4333-8333-333333333333', type: 'QUIZ', title: 'Filesystems', published: false },
  { id: '44444444-4444-4444-8444-444444444444', type: 'DISCUSSION', title: 'Covert Channels', published: false },
];

function detail() {
  return {
    id: 'outline-1',
    title: 'CSE536',
    hasPriorCorpus: false,
    modules: [
      {
        id: 'mod-1',
        title: 'Module 1',
        position: 0,
        items: ITEMS.map((i, n) => ({
          id: i.id,
          type: i.type,
          title: i.title,
          status: 'DRAFT',
          body: i.type === 'QUIZ' ? { questions: [{ type: 'MULTIPLE_CHOICE', question: 'q' }] } : {},
          position: n,
          publishedQuizId: i.published ? `quiz-${n}` : null,
          publishedChatbotId: null,
          publishedLessonId: null,
          publishedInteractiveId: null,
          faithfulBody: null,
        })),
      },
    ],
  };
}

vi.mock('@/lib/authoring/access', () => ({
  assertCanManageOutline: vi.fn(async () => ({ courseId: 'course-1', tenantId: 'tenant-1' })),
}));
vi.mock('@/lib/db/entityScopedReads', () => ({
  fetchAuthoringMessagesForOutline: vi.fn(async () => m.history),
  insertAuthoringMessagesDefiner: vi.fn(async (p: { messages: Array<{ role: string; content: string }> }) => {
    m.inserted.push(...p.messages);
  }),
  fetchCourseById: vi.fn(async () => ({ name: 'Advanced OS' })),
  applyOutlineBuildDefiner: vi.fn(),
}));
vi.mock('@/lib/authoring/outlines', () => ({
  getOutlineDetail: vi.fn(async () => detail()),
  createOutlineItem: m.createOutlineItem,
  createOutlineModule: vi.fn(),
  deleteOutlineItem: vi.fn(),
}));
vi.mock('@/lib/authoring/agent/tools', () => ({ executeToolCall: m.executeToolCall }));
vi.mock('@/lib/authoring/agentV2/generateItem', () => ({ generateItemBody: m.generateItemBody }));
vi.mock('@/lib/authoring/revisions', () => ({
  createAuthoringRevision: m.createRevision,
  listAuthoringRevisions: vi.fn(async () => []),
}));
vi.mock('@/lib/authoring/context', () => ({
  buildAuthoringMaterialsContext: vi.fn(async () => ({ text: 'materials', chunks: [], hasPriorCorpus: false })),
}));
vi.mock('@/lib/authoring/rolloverChecks', () => ({
  runRolloverChecks: vi.fn(async () => ({ findings: [{ code: 'stale_dates', message: 'Quiz end date in the past' }] })),
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/ai/tracing', () => ({ logAiSpan: vi.fn(), hashId: (s: string) => s }));
vi.mock('@/lib/ai/gateway', () => ({
  resolveModel: () => ({ model: 'gpt-4.1' }),
  aiClientFor: vi.fn(async () => ({
    chat: {
      completions: {
        create: vi.fn(async (req: { messages: Array<{ role: string; content?: string }> }) => {
          for (const msg of req.messages) if (msg.role === 'tool') m.toolMessages.push(String(msg.content));
          const step = m.script.shift() ?? { text: 'ok' };
          if ('text' in step) {
            return { choices: [{ message: { role: 'assistant', content: step.text } }] };
          }
          return {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: step.map((c, i) => ({
                    id: `call-${i}-${Math.random()}`,
                    type: 'function',
                    function: { name: c.tool, arguments: JSON.stringify(c.args ?? {}) },
                  })),
                },
              },
            ],
          };
        }),
      },
    },
  })),
}));

import { runAuthoringAgentV2 } from '@/lib/authoring/agentV2/loop';
import { needsConfirmation, readPendingMarker, withPendingMarker } from '@/lib/authoring/agentV2/pending';

const user = { id: 'u1', clerkId: 'c1' } as never;

function script(...steps: Script[]) {
  m.script = steps.map((s) =>
    s.length === 1 && 'text' in s[0]! ? (s[0] as { text: string }) : (s as Array<{ tool: string; args?: Record<string, unknown> }>),
  );
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test';
  m.script = [];
  m.toolMessages = [];
  m.history = [];
  m.inserted = [];
  m.executeToolCall.mockReset();
  m.createOutlineItem.mockReset();
  m.generateItemBody.mockReset();
  m.createRevision.mockClear();
});

const writeCalls = () => m.executeToolCall.mock.calls.length + m.createOutlineItem.mock.calls.length;

describe('authoring agent v2 (from real conversations)', () => {
  it('answers a pasted checklist question without changing anything', async () => {
    script([{ tool: 'get_publish_checks' }], [{ text: 'Not yet — two quizzes have past end dates.' }]);
    const out = await runAuthoringAgentV2(user, {
      outlineId: 'outline-1',
      message: 'did we do this Before you publish — 20 checks\nQuiz end date in the past …',
    });
    expect(writeCalls()).toBe(0);
    expect(out.assistantMessage).toBe('Not yet — two quizzes have past end dates.');
    expect(out.pendingAction).toBeUndefined();
  });

  it('"make more quizzes ~20 questions" creates a new quiz instead of rewriting existing ones', async () => {
    m.generateItemBody.mockResolvedValue({
      title: 'Deadlocks',
      body: { questions: Array.from({ length: 20 }, () => ({ type: 'MULTIPLE_CHOICE', question: 'q' })) },
    });
    m.createOutlineItem.mockResolvedValue({ id: 'new-1', title: 'Deadlocks' });
    script(
      [{ tool: 'get_outline' }],
      [{ tool: 'create_item', args: { module_id: 'mod-1', type: 'QUIZ', title: 'Deadlocks', brief: 'deadlocks', question_count: 20 } }],
      [{ text: 'Added a 20-question quiz on deadlocks.' }],
    );
    const out = await runAuthoringAgentV2(user, { outlineId: 'outline-1', message: 'can we make some more quizzes around 20 questions' });
    expect(m.executeToolCall).not.toHaveBeenCalled();
    expect(m.generateItemBody).toHaveBeenCalledWith(expect.objectContaining({ questionCount: 20, type: 'QUIZ' }));
    expect(out.assistantMessage).toContain('**Changes made**');
    expect(out.assistantMessage).toContain('Created quiz “Deadlocks” (20 questions)');
    expect(out.patchedItemIds).toEqual(['new-1']);
    expect(m.createRevision).toHaveBeenCalledOnce();
  });

  it('release asks for confirmation and does not run', async () => {
    script(
      [{ tool: 'release_items', args: { item_ids: [ITEMS[0]!.id, ITEMS[1]!.id] } }],
      [{ text: 'Ready to release these two once you confirm.' }],
    );
    const out = await runAuthoringAgentV2(user, { outlineId: 'outline-1', message: 'release the first two quizzes' });
    expect(m.executeToolCall).not.toHaveBeenCalled();
    expect(out.pendingAction?.summaries[0]).toMatch(/Release 2 items to students/);
    expect(out.assistantMessage).toContain('**Waiting for your confirmation**');
    expect(out.assistantMessage).not.toContain('Changes made');
    const stored = m.inserted.find((x) => x.role === 'assistant')!.content;
    expect(readPendingMarker(stored)?.calls[0]?.tool).toBe('release_items');
  });

  it('Confirm runs the parked release and reports only what happened', async () => {
    const pending = withPendingMarker('Ready to release.', {
      calls: [{ tool: 'release_items', args: { item_ids: [ITEMS[0]!.id] }, summary: 'Release 1 item' }],
      createdAt: new Date().toISOString(),
    });
    m.history = [{ id: 'a', role: 'assistant', content: pending, createdAt: new Date() }];
    m.executeToolCall.mockResolvedValue({
      name: 'release_items',
      ok: true,
      released: [{ id: ITEMS[0]!.id, title: ITEMS[0]!.title }],
      failed: [],
      resolvedIds: [ITEMS[0]!.id],
    });
    const out = await runAuthoringAgentV2(user, { outlineId: 'outline-1', message: 'Confirm', confirmPending: true });
    expect(m.executeToolCall).toHaveBeenCalledOnce();
    expect(out.releasedItemIds).toEqual([ITEMS[0]!.id]);
    expect(out.assistantMessage).toContain('Released “UNIX Process Tree” to students');
  });

  it('release of an unpublished quiz reports it instead of "Quiz not found"', async () => {
    const pending = withPendingMarker('x', {
      calls: [{ tool: 'release_items', args: { item_ids: [ITEMS[2]!.id] }, summary: 'Release 1 item' }],
      createdAt: new Date().toISOString(),
    });
    m.history = [{ id: 'a', role: 'assistant', content: pending, createdAt: new Date() }];
    const out = await runAuthoringAgentV2(user, { outlineId: 'outline-1', message: 'Confirm', confirmPending: true });
    expect(m.executeToolCall).not.toHaveBeenCalled();
    expect(out.assistantMessage).toContain("Couldn't release “Filesystems”: not published yet");
  });

  it('Cancel drops the pending action', async () => {
    m.history = [
      {
        id: 'a',
        role: 'assistant',
        content: withPendingMarker('x', {
          calls: [{ tool: 'release_items', args: { item_ids: [ITEMS[0]!.id] }, summary: 'Release' }],
          createdAt: '',
        }),
        createdAt: new Date(),
      },
    ];
    const out = await runAuthoringAgentV2(user, { outlineId: 'outline-1', message: 'Cancel', cancelPending: true });
    expect(writeCalls()).toBe(0);
    expect(out.assistantMessage).toBe('Cancelled — nothing was changed.');
  });

  it('a model that claims work without tool calls gets no "Changes made" block', async () => {
    script([{ text: 'Scheduled all quizzes for next week.' }]);
    const out = await runAuthoringAgentV2(user, { outlineId: 'outline-1', message: 'publish all the quizzes' });
    expect(out.assistantMessage).not.toContain('Changes made');
    expect(out.publishedItemIds).toBeUndefined();
  });

  it('rejects invented item ids and tells the model', async () => {
    script(
      [{ tool: 'publish_items', args: { item_ids: ['99999999-9999-4999-8999-999999999999'] } }],
      [{ text: 'I could not find that item.' }],
    );
    await runAuthoringAgentV2(user, { outlineId: 'outline-1', message: 'publish quiz 9' });
    expect(m.executeToolCall).not.toHaveBeenCalled();
    expect(m.toolMessages.some((t) => t.includes('Unknown item id'))).toBe(true);
  });

  it('publishes up to 3 unpublished items immediately', async () => {
    m.executeToolCall.mockResolvedValue({
      name: 'publish_items',
      ok: true,
      published: [{ id: ITEMS[2]!.id, title: ITEMS[2]!.title }],
      failed: [],
      resolvedIds: [ITEMS[2]!.id],
    });
    script([{ tool: 'publish_items', args: { item_ids: [ITEMS[2]!.id] } }], [{ text: 'Published.' }]);
    const out = await runAuthoringAgentV2(user, { outlineId: 'outline-1', message: 'publish the filesystems quiz' });
    expect(m.executeToolCall).toHaveBeenCalledOnce();
    expect(out.publishedItemIds).toEqual([ITEMS[2]!.id]);
    expect(out.pendingAction).toBeUndefined();
  });
});

describe('streamed steps', () => {
  it('labels each step with what the agent is actually doing', async () => {
    m.generateItemBody.mockResolvedValue({ title: 'Deadlocks', body: { questions: [] } });
    m.createOutlineItem.mockResolvedValue({ id: 'new-1', title: 'Deadlocks' });
    script(
      [{ tool: 'search_materials', args: { query: 'deadlock prevention' } }],
      [{ tool: 'get_item', args: { item_id: ITEMS[1]!.id } }],
      [{ tool: 'create_item', args: { module_id: 'mod-1', type: 'QUIZ', title: 'Deadlocks', brief: 'x', question_count: 20 } }],
      [{ text: 'Done.' }],
    );
    const steps: string[] = [];
    await runAuthoringAgentV2(user, {
      outlineId: 'outline-1',
      message: 'add a deadlocks quiz',
      onStep: (label) => steps.push(label),
    });
    expect(steps).toEqual([
      'Reading the outline',
      'Searching materials for “deadlock prevention”',
      'Reading “Virtual Memory”',
      'Writing a 20-question quiz: “Deadlocks”',
    ]);
  });
});

describe('needsConfirmation', () => {
  it('matches the agreed rules', () => {
    const one = { count: 1, anyPublished: false };
    expect(needsConfirmation('release_items', one)).toBe(true);
    expect(needsConfirmation('delete_item', one)).toBe(true);
    expect(needsConfirmation('restore_revision', one)).toBe(true);
    expect(needsConfirmation('publish_items', one)).toBe(false);
    expect(needsConfirmation('publish_items', { count: 4, anyPublished: false })).toBe(true);
    expect(needsConfirmation('edit_items', one)).toBe(false);
    expect(needsConfirmation('edit_items', { count: 1, anyPublished: true })).toBe(true);
    expect(needsConfirmation('edit_items', { count: 4, anyPublished: false })).toBe(true);
    expect(needsConfirmation('create_item', one)).toBe(false);
  });
});
