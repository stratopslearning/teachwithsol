import { z } from 'zod';

import { getAiClientForTask, resolveModel } from '@/lib/ai/gateway';
import { temperatureForModel } from '@/lib/ai/modelRouter';
import { ApiError } from '@/lib/api/errors';
import { logAudit } from '@/lib/audit';
import {
  AUTHORING_MODEL,
  AUTHORING_PROMPT_VERSION,
} from '@/lib/authoring/constants';
import { OUTLINE_ITEM_TYPES, QUESTION_TYPES } from '@/app/db/enums';
import {
  assertCourseHasReadyMaterials,
  buildAuthoringMaterialsContext,
} from '@/lib/authoring/context';
import {
  persistGeneratedOutline,
  type OutlineDetail,
} from '@/lib/authoring/outlines';
import {
  AUTHORING_OUTLINE_FIXUP_PROMPT,
  AUTHORING_OUTLINE_SYSTEM_PROMPT,
  defaultAuthoringQuery,
} from '@/lib/authoring/prompts';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import type { AuthUser } from '@/lib/getOrCreateUser';

const rubricCriterionSchema = z.object({
  id: z.string().min(1).max(40),
  description: z.string().min(1),
  weight: z.number().positive().default(1),
});

const sourceCitationSchema = z.object({
  materialId: z.string().optional(),
  chunkId: z.string().optional(),
  quote: z.string().optional(),
});

const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  question: z.string().min(1),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
  referenceAnswer: z.string().optional(),
  rubric: z.array(rubricCriterionSchema).min(1).max(8).optional(),
  points: z.number().positive().optional(),
  conceptTags: z.array(z.string().min(1).max(64)).min(1).max(5).optional(),
  sourceCitations: z.array(sourceCitationSchema).optional(),
});

const flashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

const interactiveBodyObjectSchema = z
  .object({
    text: z.string().optional(),
    blanks: z
      .array(
        z.object({
          id: z.string(),
          answers: z.array(z.string()).min(1),
        }),
      )
      .optional(),
    sentence: z.string().optional(),
    words: z.array(z.string()).optional(),
    distractors: z.array(z.string()).optional(),
    panels: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          body: z.string(),
        }),
      )
      .optional(),
    hotspots: z
      .array(
        z.object({
          id: z.string(),
          xPercent: z.number(),
          yPercent: z.number(),
          label: z.string(),
          content: z.string(),
        }),
      )
      .optional(),
    imageUrl: z.string().optional(),
  })
  .passthrough();

/** Accept object or bare array (LLM often returns panels/blanks as the body). */
const interactiveBodySchema = z.preprocess((val) => {
  if (!Array.isArray(val)) return val;
  if (val.length === 0) return {};
  if (
    val.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        ('title' in entry || 'body' in entry || 'content' in entry),
    )
  ) {
    return {
      panels: val.map((panel, i) => {
        const p = panel as Record<string, unknown>;
        return {
          id: typeof p.id === 'string' ? p.id : `panel-${i + 1}`,
          title: typeof p.title === 'string' ? p.title : `Panel ${i + 1}`,
          body:
            typeof p.body === 'string'
              ? p.body
              : typeof p.content === 'string'
                ? p.content
                : typeof p.text === 'string'
                  ? p.text
                  : '',
        };
      }),
    };
  }
  if (
    val.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        ('answers' in entry || 'answer' in entry),
    )
  ) {
    return {
      blanks: val.map((blank, i) => {
        const b = blank as Record<string, unknown>;
        const answers = Array.isArray(b.answers)
          ? b.answers.map(String)
          : Array.isArray(b.answer)
            ? b.answer.map(String)
            : typeof b.answer === 'string'
              ? [b.answer]
              : [];
        return {
          id: typeof b.id === 'string' ? b.id : `blank-${i + 1}`,
          answers,
        };
      }),
    };
  }
  if (val.every((entry) => typeof entry === 'string')) {
    return { words: val.map(String) };
  }
  return {
    panels: val.map((entry, i) => ({
      id: `panel-${i + 1}`,
      title: `Panel ${i + 1}`,
      body:
        entry && typeof entry === 'object'
          ? JSON.stringify(entry)
          : String(entry ?? ''),
    })),
  };
}, interactiveBodyObjectSchema);

const chapterCheckSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctAnswer: z.string().min(1),
  explanation: z.string().optional(),
});

const chapterSectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  markdown: z.string().min(1),
  subsections: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        title: z.string().min(1).max(200),
      }),
    )
    .optional(),
  checkBank: z.array(chapterCheckSchema).min(4),
});

const interactiveChapterSchema = z.object({
  kind: z.literal('interactive_chapter'),
  subtitle: z.string().optional(),
  learningObjectives: z.array(z.string().min(1)).min(1),
  sections: z.array(chapterSectionSchema).min(1),
  wrapUpMarkdown: z.string().optional(),
  capstoneMarkdown: z.string().optional(),
});

const generatedItemSchema = z
  .object({
    type: z.enum(OUTLINE_ITEM_TYPES),
    title: z.string().min(1).max(200),
    markdown: z.string().optional(),
    description: z.string().optional(),
    flashcards: z.array(flashcardSchema).optional(),
    chapter: interactiveChapterSchema.optional(),
    questions: z.array(questionSchema).optional(),
    sourceMaterialIds: z.array(z.string()).optional(),
    sourceCitations: z.array(sourceCitationSchema).optional(),
    unsupportedFacts: z.array(z.string().min(1).max(400)).max(20).optional(),
    unsupported_facts: z.array(z.string().min(1).max(400)).max(20).optional(),
    maxAttempts: z.number().int().positive().optional(),
    passingScore: z.number().min(0).max(100).optional(),
    timeLimit: z.number().int().positive().nullable().optional(),
    /** ISO-ish datetime string; normalized on persist. */
    startDate: z.string().min(1).max(64).nullable().optional(),
    endDate: z.string().min(1).max(64).nullable().optional(),
    systemPrompt: z.string().optional(),
    instructions: z.string().optional(),
    personaName: z.string().optional(),
    interactiveKind: z
      .enum(['FILL_BLANKS', 'DRAG_WORDS', 'IMAGE_HOTSPOTS', 'ACCORDION'])
      .optional(),
    interactiveBody: interactiveBodySchema.optional(),
  })
  .transform((item) => {
    const unsupportedFacts =
      item.unsupportedFacts ?? item.unsupported_facts ?? undefined;
    const { unsupported_facts: _drop, ...rest } = item;
    return { ...rest, unsupportedFacts };
  });

const generatedOutlineSchema = z.object({
  title: z.string().min(1).max(200),
  modules: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        summary: z.string().optional(),
        items: z.array(generatedItemSchema).min(1),
      }),
    )
    .min(1)
    .max(12),
});

export type GeneratedOutlinePayload = z.infer<typeof generatedOutlineSchema>;

const ITEM_TYPES = new Set<string>(OUTLINE_ITEM_TYPES);
const INTERACTIVE_KINDS = new Set([
  'FILL_BLANKS',
  'DRAG_WORDS',
  'IMAGE_HOTSPOTS',
  'ACCORDION',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function looksLikePanel(value: unknown): boolean {
  const r = asRecord(value);
  if (!r) return false;
  return (
    coerceString(r.title) !== undefined &&
    (coerceString(r.body) !== undefined ||
      coerceString(r.content) !== undefined ||
      coerceString(r.text) !== undefined)
  );
}

function looksLikeInteractiveObject(value: Record<string, unknown>): boolean {
  return (
    typeof value.text === 'string' ||
    typeof value.sentence === 'string' ||
    Array.isArray(value.blanks) ||
    Array.isArray(value.panels) ||
    Array.isArray(value.words) ||
    Array.isArray(value.hotspots)
  );
}

function looksLikeBlank(value: unknown): boolean {
  const r = asRecord(value);
  if (!r) return false;
  return Array.isArray(r.answers) || Array.isArray(r.answer);
}

function normalizeQuestionRecord(raw: unknown): unknown {
  const q = asRecord(raw);
  if (!q) return raw;
  const typeRaw = coerceString(q.type)?.trim();
  const type = typeRaw
    ? typeRaw.toUpperCase().replace(/[\s-]+/g, '_')
    : undefined;
  let correct: unknown = q.correctAnswer ?? q.answer ?? q.correct;
  if (typeof correct === 'boolean') correct = correct ? 'true' : 'false';
  else if (typeof correct === 'number') correct = String(correct);
  else if (Array.isArray(correct)) correct = correct.map(String).join(', ');

  const optionsRaw = q.options ?? q.choices;
  const options = Array.isArray(optionsRaw)
    ? optionsRaw
        .map((option) => {
          if (typeof option === 'string') return option;
          const record = asRecord(option);
          return (
            coerceString(record?.text ?? record?.label ?? record?.value) ?? ''
          );
        })
        .filter((option) => option.trim().length > 0)
    : undefined;

  const tagsRaw = q.conceptTags ?? q.concept_tags ?? q.tags;
  const conceptTags =
    typeof tagsRaw === 'string'
      ? tagsRaw
          .split(/[,;]/)
          .map((tag) => tag.trim())
          .filter(Boolean)
      : Array.isArray(tagsRaw)
        ? tagsRaw.map((tag) => coerceString(tag)?.trim() ?? '').filter(Boolean)
        : undefined;

  const question =
    coerceString(q.question ?? q.prompt ?? q.stem)?.trim() || undefined;

  return {
    ...q,
    ...(type ? { type } : {}),
    ...(question ? { question } : {}),
    ...(correct !== undefined ? { correctAnswer: String(correct) } : {}),
    ...(options ? { options } : {}),
    ...(conceptTags ? { conceptTags } : {}),
  };
}

/**
 * LLMs often return interactiveBody as a bare array (panels/blanks/words)
 * instead of `{ panels: [...] }` / `{ blanks: [...] }` / `{ words: [...] }`.
 */
export function normalizeInteractiveBody(
  kind: string | undefined,
  body: unknown,
): Record<string, unknown> | undefined {
  if (body == null) return undefined;

  if (Array.isArray(body)) {
    if (body.length === 0) return {};
    if (body.every(looksLikePanel) || kind === 'ACCORDION') {
      return {
        panels: body.map((panel, i) => {
          const p = asRecord(panel) ?? {};
          return {
            id: coerceString(p.id) || `panel-${i + 1}`,
            title: coerceString(p.title) || `Panel ${i + 1}`,
            body:
              coerceString(p.body) ??
              coerceString(p.content) ??
              coerceString(p.text) ??
              '',
          };
        }),
      };
    }
    if (body.every(looksLikeBlank) || kind === 'FILL_BLANKS') {
      return {
        blanks: body.map((blank, i) => {
          const b = asRecord(blank) ?? {};
          const answers = Array.isArray(b.answers)
            ? b.answers.map(String)
            : Array.isArray(b.answer)
              ? b.answer.map(String)
              : coerceString(b.answer)
                ? [coerceString(b.answer)!]
                : [];
          return {
            id: coerceString(b.id) || `blank-${i + 1}`,
            answers,
          };
        }),
      };
    }
    if (body.every((v) => typeof v === 'string') || kind === 'DRAG_WORDS') {
      return { words: body.map(String) };
    }
    // Fallback: treat as accordion panels with stringified entries
    return {
      panels: body.map((entry, i) => {
        const p = asRecord(entry);
        if (p) {
          return {
            id: coerceString(p.id) || `panel-${i + 1}`,
            title: coerceString(p.title) || `Panel ${i + 1}`,
            body:
              coerceString(p.body) ??
              coerceString(p.content) ??
              coerceString(p.text) ??
              JSON.stringify(p),
          };
        }
        return {
          id: `panel-${i + 1}`,
          title: `Panel ${i + 1}`,
          body: String(entry),
        };
      }),
    };
  }

  const record = asRecord(body);
  if (!record) return undefined;

  // panels accidentally nested as a string, or top-level panel fields
  if (
    !record.panels &&
    Array.isArray(record.items) &&
    (kind === 'ACCORDION' || record.items.every(looksLikePanel))
  ) {
    return { ...record, panels: record.items };
  }

  return record;
}

/** Soft-normalize common LLM shape drift before Zod. */
export function normalizeGeneratedOutlineRaw(raw: unknown): unknown {
  const root = asRecord(raw);
  if (!root) return raw;

  const modulesRaw = root.modules ?? root.Modules ?? root.units ?? root.weeks;
  if (!Array.isArray(modulesRaw)) return raw;

  const modules = modulesRaw.map((mod, modIdx) => {
    const m = asRecord(mod) ?? {};
    const itemsRaw =
      m.items ?? m.Items ?? m.activities ?? m.content ?? m.lessons;
    const items = Array.isArray(itemsRaw)
      ? itemsRaw.map((item, itemIdx) => {
          const source = asRecord(item) ?? {};
          const nestedBody = asRecord(source.body);
          const nestedAssignment =
            nestedBody &&
            (Array.isArray(nestedBody.questions) ||
              typeof nestedBody.systemPrompt === 'string' ||
              typeof nestedBody.instructions === 'string' ||
              typeof nestedBody.markdown === 'string' ||
              nestedBody.interactiveBody != null);
          const it: Record<string, unknown> = nestedAssignment
            ? {
                ...nestedBody,
                ...source,
                questions: source.questions ?? nestedBody?.questions,
                systemPrompt: source.systemPrompt ?? nestedBody?.systemPrompt,
                instructions: source.instructions ?? nestedBody?.instructions,
                personaName: source.personaName ?? nestedBody?.personaName,
                interactiveKind:
                  source.interactiveKind ?? nestedBody?.interactiveKind,
                interactiveBody:
                  source.interactiveBody ?? nestedBody?.interactiveBody,
              }
            : source;
          const typeRaw = coerceString(it.type ?? it.Type ?? it.kind)?.trim();
          const type = typeRaw
            ? typeRaw.toUpperCase().replace(/[\s-]+/g, '_')
            : undefined;
          const title =
            coerceString(it.title ?? it.Title ?? it.name)?.trim() ||
            (type ? `${type} ${itemIdx + 1}` : `Item ${itemIdx + 1}`);

          const markdown =
            coerceString(it.markdown) ??
            coerceString(it.content) ??
            (typeof it.body === 'string' ? it.body : undefined) ??
            coerceString(it.notes) ??
            coerceString(it.text);

          const kindRaw = coerceString(
            it.interactiveKind ?? it.interactiveType ?? it.activityKind,
          )?.trim();
          let interactiveKind = kindRaw
            ? kindRaw.toUpperCase().replace(/[\s-]+/g, '_')
            : undefined;

          const objectBody =
            !it.interactiveBody &&
            nestedBody &&
            looksLikeInteractiveObject(nestedBody)
              ? nestedBody
              : undefined;
          const bodyCandidate =
            it.interactiveBody ??
            it.interactive_body ??
            (Array.isArray(it.body) ? it.body : undefined) ??
            objectBody;

          // Infer ACCORDION when body is a bare panel array and kind is missing.
          if (
            !interactiveKind &&
            Array.isArray(bodyCandidate) &&
            bodyCandidate.every(looksLikePanel)
          ) {
            interactiveKind = 'ACCORDION';
          }

          const normalized: Record<string, unknown> = {
            ...it,
            type: type && ITEM_TYPES.has(type) ? type : typeRaw,
            title,
          };
          if (markdown !== undefined) {
            normalized.markdown = markdown;
          }
          if (interactiveKind && INTERACTIVE_KINDS.has(interactiveKind)) {
            normalized.interactiveKind = interactiveKind;
          }

          const interactiveBody = normalizeInteractiveBody(
            interactiveKind && INTERACTIVE_KINDS.has(interactiveKind)
              ? interactiveKind
              : undefined,
            bodyCandidate,
          );
          if (interactiveBody) {
            const text =
              typeof interactiveBody.text === 'string'
                ? interactiveBody.text
                : typeof nestedBody?.text === 'string'
                  ? nestedBody.text
                  : undefined;
            const sentence =
              typeof interactiveBody.sentence === 'string'
                ? interactiveBody.sentence
                : typeof nestedBody?.sentence === 'string'
                  ? nestedBody.sentence
                  : undefined;
            normalized.interactiveBody = {
              ...interactiveBody,
              ...(text ? { text } : {}),
              ...(sentence ? { sentence } : {}),
            };
          } else if (Array.isArray(normalized.interactiveBody)) {
            // Drop invalid array so type-specific checks can surface a clearer error
            delete normalized.interactiveBody;
          }
          if (Array.isArray(it.questions)) {
            normalized.questions = it.questions.map(normalizeQuestionRecord);
          }

          return normalized;
        })
      : [];

    return {
      ...m,
      title:
        coerceString(m.title ?? m.Title ?? m.name)?.trim() ||
        `Module ${modIdx + 1}`,
      summary: coerceString(m.summary ?? m.Summary) ?? m.summary,
      items,
    };
  });

  return {
    ...root,
    title:
      coerceString(root.title ?? root.Title)?.trim() ||
      'Course outline',
    modules,
  };
}

function formatZodIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'schema error';
  const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
  return `${path}: ${issue.message}`;
}

const FILL_BLANK_MARKER = /\{\{[^}]+\}\}/g;

function assertActivityMix(data: GeneratedOutlinePayload): void {
  let hasDiscussion = false;
  let hasFillBlanks = false;

  for (const mod of data.modules) {
    const first = mod.items[0];
    if (!first || first.type !== 'LESSON') {
      throw ApiError.badRequest(
        `Module “${mod.title}” must start with an interactive LESSON chapter`,
      );
    }
    const types = new Set(mod.items.map((i) => i.type));
    if (!types.has('QUIZ')) {
      throw ApiError.badRequest(
        `Module “${mod.title}” must include at least one QUIZ after the lesson`,
      );
    }
    if (types.has('DISCUSSION')) hasDiscussion = true;
    for (const item of mod.items) {
      if (
        item.type === 'INTERACTIVE' &&
        item.interactiveKind === 'FILL_BLANKS'
      ) {
        hasFillBlanks = true;
      }
    }
  }

  if (!hasDiscussion) {
    throw ApiError.badRequest(
      'Outline must include at least one DISCUSSION activity',
    );
  }
  if (!hasFillBlanks) {
    throw ApiError.badRequest(
      'Outline must include at least one FILL_BLANKS interactive',
    );
  }
}

function assertInteractiveBody(
  kind: NonNullable<GeneratedOutlinePayload['modules'][0]['items'][0]['interactiveKind']>,
  body: Record<string, unknown>,
): void {
  if (kind === 'FILL_BLANKS') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      throw ApiError.badRequest('FILL_BLANKS requires interactiveBody.text');
    }
    const markers = text.match(FILL_BLANK_MARKER) ?? [];
    if (markers.length === 0) {
      throw ApiError.badRequest(
        'FILL_BLANKS text must include {{answer}} markers',
      );
    }
    const blanks = Array.isArray(body.blanks) ? body.blanks : [];
    if (blanks.length < 1) {
      throw ApiError.badRequest('FILL_BLANKS requires at least one blank');
    }
    for (const blank of blanks) {
      const b = asRecord(blank);
      if (!b || !coerceString(b.id)?.trim()) {
        throw ApiError.badRequest('FILL_BLANKS blanks require an id');
      }
      if (!Array.isArray(b.answers) || b.answers.length < 1) {
        throw ApiError.badRequest(
          'FILL_BLANKS blanks require at least one answer',
        );
      }
    }
    if (blanks.length !== markers.length) {
      throw ApiError.badRequest(
        'FILL_BLANKS blank count must match {{marker}} count in text',
      );
    }
    return;
  }

  if (kind === 'DRAG_WORDS') {
    const sentence =
      typeof body.sentence === 'string' ? body.sentence.trim() : '';
    if (!sentence) {
      throw ApiError.badRequest('DRAG_WORDS requires interactiveBody.sentence');
    }
    if (!Array.isArray(body.words) || body.words.length < 1) {
      throw ApiError.badRequest('DRAG_WORDS requires interactiveBody.words');
    }
    return;
  }

  if (kind === 'ACCORDION') {
    const panels = Array.isArray(body.panels) ? body.panels : [];
    if (panels.length < 1) {
      throw ApiError.badRequest('ACCORDION requires at least one panel');
    }
    for (const panel of panels) {
      const p = asRecord(panel);
      if (
        !p ||
        !coerceString(p.title)?.trim() ||
        !coerceString(p.body)?.trim()
      ) {
        throw ApiError.badRequest('ACCORDION panels require title and body');
      }
    }
    return;
  }

  if (kind === 'IMAGE_HOTSPOTS') {
    if (!Array.isArray(body.hotspots) || body.hotspots.length < 1) {
      throw ApiError.badRequest('IMAGE_HOTSPOTS requires hotspots');
    }
  }
}

type GeneratedItem = GeneratedOutlinePayload['modules'][number]['items'][number];

/** Per-item body rules shared by full outline generation and faithful build. */
export function assertGeneratedItemContent(item: GeneratedItem): void {
  if (item.type === 'LESSON') {
    if (!item.chapter || item.chapter.kind !== 'interactive_chapter') {
      throw ApiError.badRequest(
        'LESSON items require an interactive_chapter body',
      );
    }
    if (item.chapter.sections.length < 4) {
      throw ApiError.badRequest(
        'Interactive chapters need at least 4 sections',
      );
    }
    if (item.chapter.learningObjectives.length < 2) {
      throw ApiError.badRequest(
        'Interactive chapters need at least 2 learning objectives',
      );
    }
    for (const section of item.chapter.sections) {
      if (!section.markdown?.trim()) {
        throw ApiError.badRequest(
          `Chapter section “${section.title}” needs reading content`,
        );
      }
      if (section.checkBank.length < 6) {
        throw ApiError.badRequest(
          `Chapter section “${section.title}” needs at least 6 check questions`,
        );
      }
      for (const q of section.checkBank) {
        if (!q.options.includes(q.correctAnswer)) {
          throw ApiError.badRequest(
            `Chapter section “${section.title}”: correctAnswer must match an option`,
          );
        }
      }
    }
  }
  if (item.type === 'QUIZ') {
    if (!item.questions || item.questions.length < 5) {
      throw ApiError.badRequest('QUIZ items require at least 5 questions');
    }
    if (item.questions.length > 8) {
      throw ApiError.badRequest('QUIZ items allow at most 8 questions');
    }
    if (!item.questions.some((q) => q.type === 'SHORT_ANSWER')) {
      throw ApiError.badRequest(
        'QUIZ items require at least one SHORT_ANSWER question',
      );
    }
    for (const q of item.questions) {
      if (!q.conceptTags || q.conceptTags.length < 1) {
        throw ApiError.badRequest(
          'QUIZ questions require at least one conceptTag',
        );
      }
      if (q.type === 'SHORT_ANSWER' && !q.correctAnswer?.trim()) {
        throw ApiError.badRequest(
          'SHORT_ANSWER questions require correctAnswer',
        );
      }
      if (
        q.type === 'MULTIPLE_CHOICE' &&
        (!q.options || q.options.length < 2 || !q.correctAnswer?.trim())
      ) {
        throw ApiError.badRequest(
          'MULTIPLE_CHOICE questions require options and correctAnswer',
        );
      }
    }
  }
  if (item.type === 'DISCUSSION') {
    if (!item.systemPrompt?.trim() || !item.instructions?.trim()) {
      throw ApiError.badRequest(
        'DISCUSSION items require systemPrompt and instructions',
      );
    }
  }
  if (item.type === 'INTERACTIVE') {
    if (!item.interactiveKind) {
      throw ApiError.badRequest('INTERACTIVE items require interactiveKind');
    }
    if (
      !item.interactiveBody ||
      Object.keys(item.interactiveBody).length === 0
    ) {
      throw ApiError.badRequest('INTERACTIVE items require interactiveBody');
    }
    assertInteractiveBody(
      item.interactiveKind,
      item.interactiveBody as Record<string, unknown>,
    );
  }
}

/**
 * Validate one assignment body (quiz, discussion, or interactive).
 * Does not require the full-outline activity mix.
 */
export function parseBuiltAssignmentItem(raw: unknown): GeneratedItem {
  const parsed = generatedOutlineSchema.safeParse(
    normalizeGeneratedOutlineRaw({
      title: 'Assignment',
      modules: [{ title: 'Module', items: [raw] }],
    }),
  );
  if (!parsed.success) {
    throw ApiError.badRequest(
      `Invalid assignment body: ${formatZodIssue(parsed.error)}`,
    );
  }
  const item = parsed.data.modules[0]?.items[0];
  if (!item) {
    throw ApiError.badRequest('Invalid assignment body');
  }
  assertGeneratedItemContent(item);
  return item;
}

/** Validate LLM JSON into a persistable outline shape. Exported for unit tests. */
export function parseGeneratedOutline(raw: unknown): GeneratedOutlinePayload {
  const parsed = generatedOutlineSchema.safeParse(
    normalizeGeneratedOutlineRaw(raw),
  );
  if (!parsed.success) {
    throw ApiError.badRequest(
      `Invalid generated outline: ${formatZodIssue(parsed.error)}`,
    );
  }
  for (const mod of parsed.data.modules) {
    for (const item of mod.items) {
      assertGeneratedItemContent(item);
    }
  }
  assertActivityMix(parsed.data);
  return parsed.data;
}

function normalizeOptionalIso(
  value: string | null | undefined,
): string | null | undefined {
  if (value == null) return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function toPersistModules(data: GeneratedOutlinePayload) {
  return data.modules.map((mod) => ({
    title: mod.title,
    summary: mod.summary ?? null,
    items: mod.items.map((item) => ({
      type: item.type,
      title: item.title,
      body: {
        markdown: item.markdown,
        description: item.description,
        flashcards: item.flashcards,
        chapter: item.chapter,
        questions: item.questions,
        sourceCitations: item.sourceCitations,
        unsupportedFacts: item.unsupportedFacts,
        maxAttempts: item.maxAttempts,
        passingScore: item.passingScore,
        timeLimit: item.timeLimit,
        startDate: normalizeOptionalIso(item.startDate),
        endDate: normalizeOptionalIso(item.endDate),
        systemPrompt: item.systemPrompt,
        instructions: item.instructions,
        personaName: item.personaName,
        interactiveKind: item.interactiveKind,
        interactiveBody: item.interactiveBody,
      },
      sourceMaterialIds: item.sourceMaterialIds ?? [],
    })),
  }));
}

/**
 * Core LLM generation from an already-built materials/book context string.
 * Retries once with a fix-up prompt if validation fails.
 */
export async function generateOutlineFromContext(opts: {
  courseTitle: string;
  brief?: string | null;
  materialsContext: string;
  titleHint?: string;
  workspaceId?: string | null;
}): Promise<GeneratedOutlinePayload> {
  if (opts.workspaceId) {
    const { checkAiBandAvailable } = await import('@/lib/workspace/aiCapGuard');
    const cap = await checkAiBandAvailable(opts.workspaceId);
    if (!cap.ok) {
      throw ApiError.forbidden(cap.reason);
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    throw ApiError.badRequest('OpenAI is not configured');
  }
  if (!opts.materialsContext.trim()) {
    throw ApiError.badRequest('No materials context provided for outline generation');
  }

  const openai = getAiClientForTask('outline', { timeout: 90_000 });
  const outlineModel = resolveModel('outline').model;
  const userMsg = `Course: ${opts.courseTitle}
${opts.brief?.trim() ? `Instructor brief: ${opts.brief.trim()}\n` : ''}${
    opts.titleHint?.trim()
      ? `Preferred outline title hint: ${opts.titleHint.trim()}\n`
      : ''
  }
Materials:
${opts.materialsContext}`;

  async function call(messages: Array<{ role: 'system' | 'user'; content: string }>) {
    const outlineTemp = temperatureForModel(outlineModel, 0.4);
    const completion = await openai.chat.completions.create({
      model: outlineModel,
      ...(outlineTemp != null ? { temperature: outlineTemp } : {}),
      response_format: { type: 'json_object' },
      messages,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('empty response');
    return JSON.parse(content) as unknown;
  }

  const OUTLINE_GEN_USER_ERROR = 'Outline didn’t come together';

  function sanitizeOutlineFailureReason(raw: string): string {
    const cleaned = raw
      .replace(/^Invalid generated outline:\s*/i, '')
      .replace(/^ApiError:\s*/i, '')
      .trim();
    if (!cleaned || /schema error|validation failed|empty response/i.test(cleaned)) {
      return '';
    }
    return cleaned.length > 140 ? `${cleaned.slice(0, 137)}…` : cleaned;
  }

  let raw: unknown;
  try {
    raw = await call([
      {
        role: 'system',
        content: `${AUTHORING_OUTLINE_SYSTEM_PROMPT}\nPROMPT_VERSION=${AUTHORING_PROMPT_VERSION}`,
      },
      { role: 'user', content: userMsg },
    ]);
  } catch (err) {
    console.error('generateOutlineFromContext OpenAI failed', err);
    throw ApiError.badRequest(OUTLINE_GEN_USER_ERROR);
  }

  try {
    return parseGeneratedOutline(raw);
  } catch (firstErr) {
    const reason =
      firstErr instanceof Error ? firstErr.message : 'validation failed';
    console.warn('[generateOutlineFromContext] retrying after validation', {
      reason,
    });
    const previousJson = (() => {
      try {
        return JSON.stringify(raw).slice(0, 12_000);
      } catch {
        return '(unserializable)';
      }
    })();
    try {
      raw = await call([
        { role: 'system', content: AUTHORING_OUTLINE_SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
        {
          role: 'user',
          content: `${AUTHORING_OUTLINE_FIXUP_PROMPT}

Validation error: ${reason}

Previous JSON to fix:
${previousJson}`,
        },
      ]);
      return parseGeneratedOutline(raw);
    } catch (err) {
      console.error('generateOutlineFromContext retry failed', err);
      const detail = sanitizeOutlineFailureReason(
        err instanceof Error ? err.message : reason,
      );
      throw ApiError.badRequest(
        detail ? `${OUTLINE_GEN_USER_ERROR}: ${detail}` : OUTLINE_GEN_USER_ERROR,
      );
    }
  }
}

export async function generateCourseOutline(
  user: AuthUser,
  opts: {
    courseId: string;
    brief?: string;
  },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<OutlineDetail> {
  const course = await assertCanManageCourse(user, opts.courseId);
  {
    const { requireCourseTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    await requireCourseTeaching(opts.courseId, user);
  }
  await assertCourseHasReadyMaterials(opts.courseId);

  const query =
    opts.brief?.trim() || defaultAuthoringQuery(course.title);
  const { text: materialsContext, chunks } =
    await buildAuthoringMaterialsContext(opts.courseId, query);

  if (!materialsContext) {
    throw ApiError.badRequest(
      'No indexed material chunks found. Wait for materials to finish processing.',
    );
  }

  const data = await generateOutlineFromContext({
    courseTitle: course.title,
    brief: opts.brief,
    materialsContext,
    workspaceId: course.workspaceId,
  });

  const outline = await persistGeneratedOutline({
    user,
    courseId: opts.courseId,
    title: data.title,
    brief: opts.brief ?? null,
    modules: toPersistModules(data),
  });

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'professor.authoring.generate',
    targetType: 'course_outline',
    targetId: outline.id,
    tenantId: course.workspaceId ?? null,
    metadata: {
      courseId: opts.courseId,
      moduleCount: outline.modules.length,
      chunkCount: chunks.length,
    },
    ip: audit?.ip ?? null,
    userAgent: audit?.userAgent ?? null,
  });

  return outline;
}
