import { describe, expect, it, afterEach } from 'vitest';

import {
  purposeForTask,
  resolveModel,
  tierForTask,
} from '@/lib/ai/modelRouter';

describe('modelRouter', () => {
  const keys = [
    'SOL_MODEL_FAST',
    'SOL_MODEL_BALANCED',
    'SOL_MODEL_STRONG',
    'SOL_MODEL_BUILD',
    'SOL_MODEL_GRADE',
    'OPENAI_AUTHORING_MODEL',
  ];
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
      delete saved[k];
    }
  });

  function stash(key: string) {
    saved[key] = process.env[key];
  }

  it('maps tasks to tiers and purposes', () => {
    expect(tierForTask('grade')).toBe('fast');
    expect(tierForTask('build')).toBe('strong');
    expect(tierForTask('refine')).toBe('strong');
    expect(tierForTask('agent')).toBe('strong');
    expect(purposeForTask('tutor')).toBe('chatbot');
    expect(purposeForTask('review')).toBe('authoring');
  });

  it('resolves default models', () => {
    for (const k of keys) {
      stash(k);
      delete process.env[k];
    }
    expect(resolveModel('grade').model).toBe('gpt-5-mini-2025-08-07');
    expect(resolveModel('build').model).toBe('gpt-4.1');
    expect(resolveModel('refine').model).toBe('gpt-4.1');
    expect(resolveModel('agent').model).toBe('gpt-4.1');
    expect(resolveModel('embed').model).toBe('text-embedding-3-small');
  });

  it('honors per-task and tier env overrides', () => {
    for (const k of keys) stash(k);
    process.env.SOL_MODEL_STRONG = 'gpt-4o';
    process.env.SOL_MODEL_BUILD = 'gpt-5';
    expect(resolveModel('review').model).toBe('gpt-4o');
    expect(resolveModel('build').model).toBe('gpt-5');
  });
});
