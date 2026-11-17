/**
 * AI gateway — the ONLY module allowed to construct an OpenAI client
 * (`createOpenAIClient` is ESLint-banned elsewhere).
 *
 * Responsibilities:
 *  - single construction point (tracing, retries, timeouts per purpose)
 *  - per-tenant budget reservation (Redis atomic, process fallback)
 *  - task → model routing via modelRouter (callers never hard-code models)
 *  - the one place where decrypted student content may flow to the provider
 */
import type OpenAI from 'openai';

import { ApiError } from '@/lib/api/errors';
import { createOpenAIClient } from '@/lib/ai/openai';
import {
  purposeForTask,
  resolveModel,
  temperatureForModel,
  type AiPurpose,
  type AiTask,
  type ResolvedModel,
} from '@/lib/ai/modelRouter';
import { reserveRedisBudget } from '@/lib/ai/redisBudget';
import { surfaceFromPurpose, tracedAi } from '@/lib/ai/tracing';

export type { AiPurpose, AiTask, ResolvedModel };
export { purposeForTask, resolveModel, temperatureForModel };

type PurposeDefaults = { maxRetries: number; timeout: number };

export const PURPOSE_DEFAULTS: Record<AiPurpose, PurposeDefaults> = {
  grading: { maxRetries: 2, timeout: 25_000 },
  rubric: { maxRetries: 2, timeout: 25_000 },
  chatbot: { maxRetries: 2, timeout: 20_000 },
  embed: { maxRetries: 2, timeout: 60_000 },
  authoring: { maxRetries: 2, timeout: 90_000 },
};

export type AiClientOptions = Partial<PurposeDefaults>;

/** Build (never cache across requests) an OpenAI client for a purpose. */
export function getAiClient(
  purpose: AiPurpose,
  options: AiClientOptions = {},
): OpenAI {
  const d = PURPOSE_DEFAULTS[purpose];
  return createOpenAIClient({
    maxRetries: options.maxRetries ?? d.maxRetries,
    timeout: options.timeout ?? d.timeout,
  });
}

/**
 * The entry point for model calls: reserves the workspace's AI budget (429
 * when it's spent), then returns a client for the task. Pass the tenant, or
 * a course id to resolve it from; with neither (system jobs) the budget is
 * skipped. Budget defaults: AI_BUDGET_CAPACITY (500) units per
 * AI_BUDGET_WINDOW_MS (60 s) per workspace.
 */
export async function aiClientFor(
  task: AiTask,
  scope: { tenantId?: string | null; courseId?: string | null },
  options: AiClientOptions & { units?: number } = {},
): Promise<OpenAI> {
  let tenantId = scope.tenantId ?? null;
  if (!tenantId && scope.courseId) {
    const { fetchCourseById } = await import('@/lib/db/entityScopedReads');
    const course = await fetchCourseById(scope.courseId);
    tenantId = course?.tenantId ?? course?.workspaceId ?? null;
  }
  if (tenantId && process.env.AI_GATEWAY_ENFORCE_BUDGET !== '0') {
    const decision = await reserveRedisBudget(tenantId, options.units ?? 1);
    if (!decision.allowed) {
      throw ApiError.tooMany('AI budget exceeded for this workspace. Try again shortly.');
    }
  }
  return getAiClientForTask(task, options);
}

/** Client for a routed task (purpose inferred from task). Prefer aiClientFor. */
export function getAiClientForTask(
  task: AiTask,
  options: AiClientOptions = {},
): OpenAI {
  return getAiClient(purposeForTask(task), options);
}

/**
 * Reserve tenant budget then run `fn` with a client. Throws 429 when the tenant
 * is over budget. Callers without a tenant (system jobs) skip reservation.
 */
export async function runAi<T>(opts: {
  purpose: AiPurpose;
  tenantId?: string | null;
  units?: number;
  clientOptions?: AiClientOptions;
  task?: AiTask;
  fn: (client: OpenAI) => Promise<T>;
}): Promise<T> {
  if (opts.tenantId && process.env.AI_GATEWAY_ENFORCE_BUDGET !== '0') {
    const decision = await reserveRedisBudget(opts.tenantId, opts.units ?? 1);
    if (!decision.allowed) {
      throw ApiError.tooMany('AI budget exceeded for this workspace. Try again shortly.');
    }
  }
  const surface = surfaceFromPurpose(opts.purpose);
  return tracedAi(
    opts.task ? `ai.${opts.task}` : `ai.${opts.purpose}`,
    surface,
    {
      purpose: opts.purpose,
      ...(opts.task ? { task: opts.task } : {}),
    },
    async () => opts.fn(getAiClient(opts.purpose, opts.clientOptions)),
  );
}

/** Like runAi but resolves purpose + model from task. */
export async function runAiTask<T>(opts: {
  task: AiTask;
  tenantId?: string | null;
  units?: number;
  clientOptions?: AiClientOptions;
  fn: (client: OpenAI, resolved: ResolvedModel) => Promise<T>;
}): Promise<T> {
  const purpose = purposeForTask(opts.task);
  const resolved = resolveModel(opts.task);
  return runAi({
    purpose,
    tenantId: opts.tenantId,
    units: opts.units,
    clientOptions: opts.clientOptions,
    task: opts.task,
    fn: (client) => opts.fn(client, resolved),
  });
}
