import type { OutOfScopeAction } from '@/lib/authoring/agent/classify';
import type { OutlineInventory } from '@/lib/authoring/agent/inventory';

/** Deterministic reply for meta / help prompts — never dumps the outline inventory. */
export function authoringCapabilitiesReply(
  inventory?: OutlineInventory,
): string {
  const total = inventory?.counts.total ?? inventory?.items.length ?? 0;
  const published = inventory?.counts.published ?? 0;
  const grounding =
    total > 0
      ? `\n\nThis outline has **${total}** item${total === 1 ? '' : 's'} (**${published}** published draft${published === 1 ? '' : 's'}).`
      : '';

  return [
    `I help you author course assignments in this chat.${grounding}`,
    '',
    '### What I can do',
    '',
    '- **Refine** — rewrite stems, make quizzes harder/easier, update discussion prompts',
    '- **Interactive lessons** — add Shah-style interactive chapters at the start of each module',
    '- **Propose outline** — rebuild a fresh outline from materials (Re-propose), not via item refine',
    '- **Publish** — turn outline items into inactive assignment drafts',
    '- **Release** — make published drafts visible to students',
    '- **Schedule** — set due dates, attempts, time limits, and passing scores',
    '- **Restore** — roll back to a saved revision when you ask to undo',
    '- **Status** — what’s published, unpublished, or focused',
    '- **Advise** — difficulty, coverage, and sensible next steps from your materials',
    '',
    '### Try saying',
    '',
    '- “propose an outline from my materials”',
    '- “add interactive lessons to each module”',
    '- “make the virtual memory quiz harder”',
    '- “publish the first three quizzes”',
    '- “how many quizzes are unpublished?”',
    '',
    'Tip: open an assignment in the outline panel to focus edits on that item.',
  ].join('\n');
}

export function authoringOutOfScopeReply(action: OutOfScopeAction): string {
  switch (action) {
    case 'unpublish':
      return [
        '### Not available in chat yet',
        '',
        'I can’t **unpublish** or hide live assignments from here.',
        '',
        '**Instead:** open the assignment in the outline panel and adjust visibility / deactivate the published quiz or discussion there.',
      ].join('\n');
    case 'add_item':
      return [
        '### Not available in chat yet',
        '',
        'I can’t **add a new outline item** from chat.',
        '',
        '**Instead:** propose a new outline, or edit structure in the outline panel.',
      ].join('\n');
    case 'delete_item':
      return [
        '### Not available in chat yet',
        '',
        'I can’t **delete** outline items from chat.',
        '',
        '**Instead:** remove or archive them from the outline panel.',
      ].join('\n');
    case 'reorder':
      return [
        '### Not available in chat yet',
        '',
        'I can’t **reorder** modules or assignments from chat.',
        '',
        '**Instead:** drag to reorder in the outline panel.',
      ].join('\n');
    case 'set_brief':
      return [
        '### Not available in chat yet',
        '',
        'I can’t **change the course brief** from chat.',
        '',
        '**Instead:** start a new outline propose with an updated brief.',
      ].join('\n');
    case 'grade':
      return [
        '### Outside authoring chat',
        '',
        'I author assignments here — I don’t score student attempts.',
        '',
        '**Instead:** use **Review → Results** for grading.',
      ].join('\n');
    case 'email':
      return [
        '### Outside authoring chat',
        '',
        'I can’t email students from here.',
        '',
        '**Instead:** use your section roster or workspace messaging tools.',
      ].join('\n');
    default:
      return [
        '### Not available in chat yet',
        '',
        'That action isn’t supported here.',
        '',
        'Ask **what I can do**, or use the outline panel for structure edits.',
      ].join('\n');
  }
}

export function authoringClarifyReply(question: string): string {
  const q = question.trim();
  if (!q) return q;
  return [`### Quick check`, '', q].join('\n');
}
