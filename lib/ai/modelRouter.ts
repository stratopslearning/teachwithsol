/**
 * Smart model router — maps AI task kinds to OpenAI model tiers.
 *
 * Callers must never hard-code model strings; resolve via `resolveModel(task)`.
 * Env overrides: SOL_MODEL_FAST / BALANCED / STRONG / EMBED, plus per-task
 * SOL_MODEL_<TASK> (e.g. SOL_MODEL_BUILD).
 */

export type AiTask =
  | 'grade'
  | 'grade_escalate'
  | 'rubric'
  | 'tutor'
  | 'outline'
  | 'skeleton'
  | 'build'
  | 'refine'
  | 'switch_up'
  | 'review'
  | 'insights'
  /** Authoring chat agent: multi-step tool calling. */
  | 'agent'
  | 'embed';

export type ModelTier = 'fast' | 'balanced' | 'strong' | 'embed';

export type ResolvedModel = {
  task: AiTask;
  tier: ModelTier;
  model: string;
};

/** Gateway purpose used for timeouts / budget accounting. */
export type AiPurpose =
  | 'grading'
  | 'rubric'
  | 'chatbot'
  | 'embed'
  | 'authoring';

const TASK_TIER: Record<AiTask, ModelTier> = {
  grade: 'fast',
  grade_escalate: 'strong',
  rubric: 'strong',
  tutor: 'fast',
  outline: 'fast',
  skeleton: 'fast',
  build: 'strong',
  refine: 'strong',
  switch_up: 'balanced',
  review: 'strong',
  insights: 'balanced',
  agent: 'strong',
  embed: 'embed',
};

const TIER_DEFAULTS: Record<ModelTier, string> = {
  fast: 'gpt-5-mini-2025-08-07',
  balanced: 'gpt-4.1-mini',
  strong: 'gpt-4.1',
  embed: 'text-embedding-3-small',
};

const TASK_PURPOSE: Record<AiTask, AiPurpose> = {
  grade: 'grading',
  grade_escalate: 'grading',
  rubric: 'rubric',
  tutor: 'chatbot',
  outline: 'authoring',
  skeleton: 'authoring',
  build: 'authoring',
  refine: 'authoring',
  switch_up: 'authoring',
  review: 'authoring',
  insights: 'authoring',
  agent: 'authoring',
  embed: 'embed',
};

const TASK_ENV_KEYS: Partial<Record<AiTask, string>> = {
  grade: 'SOL_MODEL_GRADE',
  grade_escalate: 'SOL_MODEL_GRADE_ESCALATE',
  rubric: 'SOL_MODEL_RUBRIC',
  tutor: 'SOL_MODEL_TUTOR',
  outline: 'SOL_MODEL_OUTLINE',
  skeleton: 'SOL_MODEL_SKELETON',
  build: 'SOL_MODEL_BUILD',
  refine: 'SOL_MODEL_REFINE',
  switch_up: 'SOL_MODEL_SWITCH_UP',
  review: 'SOL_MODEL_REVIEW',
  insights: 'SOL_MODEL_INSIGHTS',
  agent: 'SOL_MODEL_AGENT',
  embed: 'SOL_MODEL_EMBED',
};

const TIER_ENV_KEYS: Record<ModelTier, string> = {
  fast: 'SOL_MODEL_FAST',
  balanced: 'SOL_MODEL_BALANCED',
  strong: 'SOL_MODEL_STRONG',
  embed: 'SOL_MODEL_EMBED',
};

function envModel(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

export function tierForTask(task: AiTask): ModelTier {
  return TASK_TIER[task];
}

export function purposeForTask(task: AiTask): AiPurpose {
  return TASK_PURPOSE[task];
}

/**
 * GPT-5 / o-series reject custom temperature (only default 1).
 * Callers should omit `temperature` when this returns false.
 */
export function modelSupportsCustomTemperature(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (!m) return true;
  if (m.startsWith('gpt-5')) return false;
  if (/^o[0-9]/.test(m)) return false;
  return true;
}

/** Return temperature for the request, or undefined to use the model default. */
export function temperatureForModel(
  model: string,
  value: number,
): number | undefined {
  return modelSupportsCustomTemperature(model) ? value : undefined;
}

/** Resolve the OpenAI model id for a task (env overrides win). */
export function resolveModel(task: AiTask): ResolvedModel {
  const tier = TASK_TIER[task];
  const taskKey = TASK_ENV_KEYS[task];
  const fromTask = taskKey ? envModel(taskKey) : undefined;
  const fromTier = envModel(TIER_ENV_KEYS[tier]);
  // Legacy authoring env still honored for authoring tasks when no SOL_* set.
  const legacyAuthoring =
    TASK_PURPOSE[task] === 'authoring'
      ? envModel('OPENAI_AUTHORING_MODEL')
      : undefined;
  const model =
    fromTask ?? fromTier ?? legacyAuthoring ?? TIER_DEFAULTS[tier];
  return { task, tier, model };
}

/** Default fast grading model — used for cache-key docs / legacy imports. */
export function defaultGradeModel(): string {
  return resolveModel('grade').model;
}

export function defaultTutorModel(): string {
  return resolveModel('tutor').model;
}

export function defaultAuthoringModel(task: AiTask = 'outline'): string {
  return resolveModel(task).model;
}

export function defaultEmbedModel(): string {
  return resolveModel('embed').model;
}
