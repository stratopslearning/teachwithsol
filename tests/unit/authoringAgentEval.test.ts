import { describe, expect, it } from 'vitest';

import {
  applyTargetResolution,
  authoringCapabilitiesReply,
  authoringOutOfScopeReply,
  buildAuthoringFollowUps,
  buildOutlineInventory,
  classifyAuthoringIntent,
  encodeLastActionMarker,
  fallbackPlan,
  findLastActionInHistory,
  normalizePlan,
  parseLastActionMarker,
  resolveAuthoringTargets,
  stripLastActionMarker,
} from '@/lib/authoring/agent';
import type { OutlineDetail } from '@/lib/authoring/outlines';

function quiz(
  id: string,
  title: string,
  published: boolean,
  position = 0,
): OutlineDetail['modules'][number]['items'][number] {
  return {
    id,
    moduleId: 'm1',
    type: 'QUIZ',
    title,
    status: published ? 'PUBLISHED' : 'DRAFT',
    body: {},
    sourceMaterialIds: [],
    variantOfItemId: null,
    faithfulBody: null,
    publishedQuizId: published ? `quiz-${id}` : null,
    publishedChatbotId: null,
    publishedLessonId: null,
    publishedInteractiveId: null,
    position,
  } as OutlineDetail['modules'][number]['items'][number];
}

const detail = {
  id: 'outline-1',
  courseId: 'course-1',
  title: 'CSE536',
  status: 'READY',
  brief: null,
  hasPriorCorpus: false,
  bodiesBuilt: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  modules: [
    {
      id: 'm1',
      title: 'Memory',
      summary: null,
      position: 0,
      items: [
        quiz('1', 'Virtual Memory and Address Translation', true, 0),
        quiz('2', 'Filesystem Structures and Access Control', true, 1),
        quiz('3', 'CPU Scheduling Strategies', false, 2),
      ],
    },
  ],
} as OutlineDetail;

const inventory = buildOutlineInventory(detail);

/** Prompt suite — tool/intent contracts that must not regress. */
const PROMPTS: Array<{
  message: string;
  expectKind: string;
  forbidTools?: string[];
  requireTools?: string[];
  replyMustNot?: RegExp;
  replyMust?: RegExp;
}> = [
  {
    message: 'what things can you do',
    expectKind: 'help',
    forbidTools: ['list_outline', 'refine_items'],
    replyMust: /refine|publish|release/i,
    replyMustNot: /\[QUIZ\]/,
  },
  {
    message: 'how many quizzes are published?',
    expectKind: 'status',
    forbidTools: ['refine_items', 'publish_items'],
  },
  {
    message: 'is this too hard for undergrads?',
    expectKind: 'advise',
    forbidTools: ['publish_items', 'refine_items'],
  },
  {
    message: 'unpublish the virtual memory quiz',
    expectKind: 'out_of_scope',
  },
  {
    message: 'delete the filesystem quiz',
    expectKind: 'out_of_scope',
  },
  {
    message: 'add a new quiz about deadlocks',
    expectKind: 'out_of_scope',
  },
  {
    message: 'reorder the modules',
    expectKind: 'out_of_scope',
  },
  {
    message: 'email the students',
    expectKind: 'out_of_scope',
  },
  {
    message: 'ok go',
    expectKind: 'clarify',
  },
  {
    message: 'fix it',
    expectKind: 'clarify',
  },
  {
    message: 'make the virtual memory quiz harder',
    expectKind: 'act',
    requireTools: ['refine_items'],
  },
  {
    // Quiz-only outline fixture → outline improve upgrades to Shah lessons.
    message: 'make the outline better',
    expectKind: 'act',
    requireTools: ['ensure_interactive_lessons'],
  },
  {
    message: 'add interactive lessons to each module',
    expectKind: 'act',
    requireTools: ['ensure_interactive_lessons'],
  },
  {
    message: 'improve all quizzes',
    expectKind: 'act',
    requireTools: ['refine_items'],
  },
  {
    message: 'publish the first two quizzes then release them',
    expectKind: 'act',
  },
  {
    message: 'undo that',
    expectKind: 'undo',
  },
];

describe('authoring agent eval suite', () => {
  for (const row of PROMPTS) {
    it(`classifies: ${row.message}`, () => {
      const intent = classifyAuthoringIntent(row.message, { inventory });
      expect(intent.kind).toBe(row.expectKind);
    });
  }

  it('help path never plans list_outline', () => {
    const plan = normalizePlan('what things can you do', {
      tools: [
        { name: 'list_outline', args: {} },
        {
          name: 'answer_question',
          args: { question: 'what things can you do' },
        },
      ],
    });
    expect(plan.tools.map((t) => t.name)).toEqual(['answer_question']);
    const reply = authoringCapabilitiesReply(inventory);
    expect(reply).not.toMatch(/\[QUIZ\]/);
    expect(reply).toMatch(/Publish/);
  });

  it('out_of_scope replies stay honest', () => {
    expect(authoringOutOfScopeReply('unpublish')).toMatch(/unpublish/i);
    expect(authoringOutOfScopeReply('add_item')).toMatch(/add a new outline item/i);
    expect(authoringOutOfScopeReply('grade')).toMatch(/Review/i);
  });

  it('resolves title targets with high confidence', () => {
    const resolved = resolveAuthoringTargets(
      'make the virtual memory quiz harder',
      inventory,
    );
    expect(resolved.itemIds).toEqual(['1']);
    expect(resolved.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it('asks when two titles are ambiguous', () => {
    const wide = buildOutlineInventory({
      ...detail,
      modules: [
        {
          id: 'm1',
          title: 'M',
          summary: null,
          position: 0,
          items: [
            quiz('1', 'Memory Basics', true, 0),
            quiz('2', 'Memory Advanced', true, 1),
          ],
        },
      ],
    } as OutlineDetail);
    const resolved = resolveAuthoringTargets('update the memory quiz', wide);
    expect(resolved.itemIds).toEqual([]);
    expect(resolved.question).toMatch(/Which assignment/i);
  });

  it('applyTargetResolution converts vague refine-all into clarify', () => {
    const plan = applyTargetResolution('make it better somehow', inventory, {
      tools: [
        {
          name: 'refine_items',
          args: {
            selector: { scope: 'all' },
            instruction: 'make it better somehow',
          },
        },
      ],
    });
    expect(plan.tools[0]?.name).toBe('answer_question');
  });

  it('compound publish+release stays in fallback order', () => {
    const plan = fallbackPlan(
      'publish and release the first two quizzes',
      inventory,
    );
    expect(plan.tools.map((t) => t.name)).toEqual([
      'publish_items',
      'release_items',
    ]);
  });

  it('last-action marker round-trips and strips for display', () => {
    const marker = encodeLastActionMarker({
      tools: ['refine_items'],
      itemIds: ['1'],
      instruction: 'harder',
      at: '2026-01-01T00:00:00.000Z',
    });
    const content = `Updated “Virtual Memory”.\n${marker}`;
    expect(stripLastActionMarker(content)).toBe('Updated “Virtual Memory”.');
    expect(parseLastActionMarker(content)?.itemIds).toEqual(['1']);
    expect(
      findLastActionInHistory([
        { role: 'user', content: 'harder' },
        { role: 'assistant', content },
      ])?.tools,
    ).toEqual(['refine_items']);
  });

  it('repeat intent needs prior last action', () => {
    expect(
      classifyAuthoringIntent('do that again', { inventory }).kind,
    ).not.toBe('repeat');
    expect(
      classifyAuthoringIntent('do that again', {
        inventory,
        lastAction: {
          tools: ['publish_items'],
          itemIds: ['1'],
          at: new Date().toISOString(),
        },
      }).kind,
    ).toBe('repeat');
  });

  it('follow-ups after help are prompt-first, not only open outline', () => {
    const fus = buildAuthoringFollowUps({
      userMessage: 'what things can you do',
      inventory,
    });
    expect(fus.length).toBeGreaterThan(0);
    expect(fus.some((f) => f.action === 'prompt')).toBe(true);
    expect(fus.map((f) => f.label).join(' ')).toMatch(/harder|Publish|unpublished/i);
  });

  it('follow-ups after publish suggest release', () => {
    const fus = buildAuthoringFollowUps({
      userMessage: 'publish the first quiz',
      inventory,
      publishedItemIds: ['1'],
      focusItemId: '1',
      focusTitle: 'Virtual Memory and Address Translation',
    });
    expect(fus[0]?.action).toBe('prompt');
    expect(fus[0]?.label).toMatch(/Release/i);
  });
});
