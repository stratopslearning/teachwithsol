import { beforeEach, describe, expect, it, vi } from 'vitest';

const embedTexts = vi.hoisted(() => vi.fn());
const checkAiBandAvailable = vi.hoisted(() => vi.fn());
const recordAiUsage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/knowledge/embed', () => ({ embedTexts }));
vi.mock('@/lib/workspace', () => ({ checkAiBandAvailable, recordAiUsage }));

import { indexText } from '@/lib/knowledge/indexText';

const text = 'Photosynthesis converts light energy into chemical energy. '.repeat(20);

beforeEach(() => {
  embedTexts.mockReset().mockImplementation(async (xs: string[]) => xs.map(() => [0.1, 0.2]));
  checkAiBandAvailable.mockReset().mockResolvedValue({ ok: true });
  recordAiUsage.mockReset().mockResolvedValue(undefined);
});

describe('indexText', () => {
  it('embeds, writes the chunks, then meters usage (awaited)', async () => {
    const write = vi.fn(async (_chunks: unknown[]) => {});
    const { chunkCount } = await indexText({ text, workspaceId: 'ws', write });
    expect(chunkCount).toBeGreaterThan(0);
    expect(write).toHaveBeenCalledOnce();
    expect((write.mock.calls[0]![0] as unknown[])[0]).toMatchObject({ chunkIndex: 0, embedding: [0.1, 0.2] });
    expect(recordAiUsage).toHaveBeenCalledWith('ws', 'embed', chunkCount);
  });

  it('keeps the current index when embedding fails', async () => {
    embedTexts.mockRejectedValue(new Error('embed down'));
    const write = vi.fn(async () => {});
    await expect(indexText({ text, workspaceId: 'ws', write })).rejects.toThrow('embed down');
    expect(write).not.toHaveBeenCalled();
  });

  it('refuses when the workspace AI cap is reached', async () => {
    checkAiBandAvailable.mockResolvedValue({ ok: false, reason: 'AI limit reached' });
    const write = vi.fn(async () => {});
    await expect(indexText({ text, workspaceId: 'ws', write })).rejects.toThrow('AI limit reached');
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it('rejects text below the minimum length', async () => {
    await expect(
      indexText({ text: 'short', workspaceId: null, minChars: 200, emptyMessage: 'too short', write: vi.fn() }),
    ).rejects.toThrow('too short');
  });
});
