/**
 * AI cap grading: enqueue skips when band exceeded (documents current behavior).
 * When product queues + notifies, tighten assertions here.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('wf.grading.capQueue.contract', () => {
  it('enqueueGradeAttempt checks AI band before sending', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/jobs/enqueue.ts'),
      'utf8',
    );
    expect(src).toContain('checkAiBandAvailable');
    expect(src).toContain('grade enqueue skipped: AI cap');
  });

  it('pendingGrader records ai_band_exceeded failure reason', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/grading/pendingGrader.ts'),
      'utf8',
    );
    expect(src).toContain('ai_band_exceeded');
  });
});
