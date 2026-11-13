import { classifyAuthoringIntent } from '@/lib/authoring/agent/classify';
import type { OutlineInventory } from '@/lib/authoring/agent/inventory';

export type AuthoringFollowUp = {
  id: string;
  label: string;
  action:
    | 'prompt'
    | 'open_outline'
    | 'open_item'
    | 'preview_student'
    | 'approve_build'
    | 'publish'
    | 're_propose'
    | 'propose';
  prompt?: string;
  itemId?: string;
};

/**
 * Context-aware follow-ups after an authoring turn.
 * Prefer prompt chips that continue the workflow over generic "Open outline".
 */
export function buildAuthoringFollowUps(opts: {
  userMessage: string;
  inventory: OutlineInventory;
  patchedItemIds?: string[];
  publishedItemIds?: string[];
  releasedItemIds?: string[];
  focusItemId?: string | null;
  focusTitle?: string | null;
  needsApproval?: boolean;
  bodiesBuilt?: boolean;
}): AuthoringFollowUp[] {
  const intent = classifyAuthoringIntent(opts.userMessage, {
    inventory: opts.inventory,
  });
  const unpublished = opts.inventory.items.filter((i) => !i.published);
  const published = opts.inventory.items.filter((i) => i.published);
  const focusId = opts.focusItemId ?? opts.inventory.focus?.id ?? null;
  const focusTitle =
    opts.focusTitle ??
    opts.inventory.items.find((i) => i.id === focusId)?.title ??
    opts.inventory.focus?.title ??
    null;
  const focusLabel = focusTitle ? `“${shortTitle(focusTitle)}”` : 'this assignment';

  const out: AuthoringFollowUp[] = [];
  const add = (item: AuthoringFollowUp) => {
    if (out.some((x) => x.label === item.label || x.id === item.id)) return;
    if (out.length >= 4) return;
    out.push(item);
  };

  if (opts.needsApproval && !opts.bodiesBuilt) {
    add({
      id: 'fu-approve',
      label: 'Approve & build assignments',
      action: 'approve_build',
    });
    add({
      id: 'fu-open-outline',
      label: 'Open outline',
      action: 'open_outline',
    });
    return out;
  }

  if ((opts.publishedItemIds?.length ?? 0) > 0) {
    const n = opts.publishedItemIds!.length;
    add({
      id: 'fu-release-published',
      label:
        n === 1
          ? 'Release this draft to students'
          : `Release these ${n} drafts to students`,
      action: 'prompt',
      prompt:
        n === 1 && focusTitle
          ? `Release “${focusTitle}” to students`
          : 'Release the drafts I just published',
    });
    if (focusId) {
      add({
        id: 'fu-open-item',
        label: `Open ${focusLabel}`,
        action: 'open_item',
        itemId: focusId,
      });
    }
    add({
      id: 'fu-status-pub',
      label: 'What’s still unpublished?',
      action: 'prompt',
      prompt: 'How many quizzes are still unpublished?',
    });
    return out;
  }

  if ((opts.releasedItemIds?.length ?? 0) > 0) {
    add({
      id: 'fu-status-live',
      label: 'What is live for students?',
      action: 'prompt',
      prompt: 'What assignments are published and released?',
    });
    if (focusId) {
      add({
        id: 'fu-preview',
        label: 'Preview as student',
        action: 'preview_student',
        itemId: focusId,
      });
    }
    add({
      id: 'fu-schedule',
      label: 'Set due dates on released work',
      action: 'prompt',
      prompt: focusTitle
        ? `Set a due date next Friday on “${focusTitle}”`
        : 'Set due dates next Friday on the released quizzes',
    });
    return out;
  }

  if ((opts.patchedItemIds?.length ?? 0) > 0) {
    const patchedPublished = opts.patchedItemIds!.some((id) =>
      published.some((p) => p.id === id),
    );
    if (!patchedPublished) {
      add({
        id: 'fu-publish-refined',
        label: focusTitle
          ? `Publish ${focusLabel}`
          : 'Publish the updated drafts',
        action: 'prompt',
        prompt: focusTitle
          ? `Publish “${focusTitle}”`
          : 'Publish the assignments I just updated',
      });
    } else {
      add({
        id: 'fu-release-refined',
        label: 'Release the update to students',
        action: 'prompt',
        prompt: focusTitle
          ? `Release “${focusTitle}”`
          : 'Release the assignments I just updated',
      });
    }
    if (focusId) {
      add({
        id: 'fu-preview-refined',
        label: 'Preview as student',
        action: 'preview_student',
        itemId: focusId,
      });
      add({
        id: 'fu-harder',
        label: `Make ${focusLabel} harder`,
        action: 'prompt',
        prompt: focusTitle
          ? `Make “${focusTitle}” harder`
          : 'Make this assignment harder',
      });
    }
    add({
      id: 'fu-undo',
      label: 'Undo that change',
      action: 'prompt',
      prompt: 'Undo that',
    });
    return out;
  }

  const missingLessons =
    (opts.inventory.counts.byType.LESSON ?? 0) === 0 &&
    opts.inventory.counts.total > 0;
  if (missingLessons) {
    add({
      id: 'fu-ensure-lessons',
      label: 'Add interactive lessons per module',
      action: 'prompt',
      prompt: 'Add interactive lessons to each module',
    });
  }

  switch (intent.kind) {
    case 'help':
      add({
        id: 'fu-help-harder',
        label: 'Make a quiz harder',
        action: 'prompt',
        prompt: focusTitle
          ? `Make “${focusTitle}” harder`
          : 'Make the first quiz harder',
      });
      add({
        id: 'fu-help-publish',
        label: 'Publish the first three quizzes',
        action: 'prompt',
        prompt: 'Publish the first three quizzes',
      });
      add({
        id: 'fu-help-status',
        label: 'What’s unpublished?',
        action: 'prompt',
        prompt: 'How many quizzes are unpublished?',
      });
      if (unpublished.length > 0) {
        add({
          id: 'fu-help-release',
          label: 'Release published drafts',
          action: 'prompt',
          prompt: 'Release the first three quizzes',
        });
      }
      break;

    case 'advise':
      if (unpublished.length > 0) {
        add({
          id: 'fu-adv-pub',
          label: `Publish ${unpublished.length} unpublished item${unpublished.length === 1 ? '' : 's'}`,
          action: 'prompt',
          prompt: 'Publish all unpublished quizzes',
        });
      }
      add({
        id: 'fu-adv-harder',
        label: focusTitle
          ? `Tighten ${focusLabel}`
          : 'Make quizzes a bit harder',
        action: 'prompt',
        prompt: focusTitle
          ? `Make “${focusTitle}” a bit harder and clearer`
          : 'Make the first three quizzes a bit harder',
      });
      add({
        id: 'fu-adv-status',
        label: 'Show outline status',
        action: 'prompt',
        prompt: 'List the outline status',
      });
      break;

    case 'status':
      if (unpublished.length > 0) {
        add({
          id: 'fu-st-pub',
          label: 'Publish what’s left',
          action: 'prompt',
          prompt: 'Publish all unpublished quizzes',
        });
      }
      if (published.length > 0) {
        add({
          id: 'fu-st-rel',
          label: 'Release published drafts',
          action: 'prompt',
          prompt: 'Release all published quizzes',
        });
      }
      add({
        id: 'fu-st-help',
        label: 'What else can you do?',
        action: 'prompt',
        prompt: 'What things can you do?',
      });
      add({
        id: 'fu-st-open',
        label: 'Open outline',
        action: 'open_outline',
      });
      break;

    case 'out_of_scope':
      add({
        id: 'fu-oos-help',
        label: 'What can you do instead?',
        action: 'prompt',
        prompt: 'What things can you do?',
      });
      add({
        id: 'fu-oos-open',
        label: 'Open outline',
        action: 'open_outline',
      });
      break;

    case 'propose_outline':
      add({
        id: 'fu-propose-rebuild',
        label: 'Re-propose outline',
        action: 're_propose',
      });
      add({
        id: 'fu-propose-open',
        label: 'Open outline',
        action: 'open_outline',
      });
      add({
        id: 'fu-propose-lessons',
        label: 'Add interactive lessons per module',
        action: 'prompt',
        prompt: 'Add interactive lessons to each module',
      });
      break;

    case 'clarify':
      if (focusId && focusTitle) {
        add({
          id: 'fu-cl-focus',
          label: `Use focused ${focusLabel}`,
          action: 'prompt',
          prompt: `Make “${focusTitle}” clearer`,
        });
      }
      add({
        id: 'fu-cl-status',
        label: 'Show what’s in the outline',
        action: 'prompt',
        prompt: 'List the outline status',
      });
      add({
        id: 'fu-cl-help',
        label: 'What can you help with?',
        action: 'prompt',
        prompt: 'What things can you do?',
      });
      break;

    case 'undo':
      add({
        id: 'fu-undo-status',
        label: 'Show outline status',
        action: 'prompt',
        prompt: 'List the outline status',
      });
      add({
        id: 'fu-undo-open',
        label: 'Open outline',
        action: 'open_outline',
      });
      break;

    default:
      if (focusId) {
        add({
          id: 'fu-def-open',
          label: `Open ${focusLabel}`,
          action: 'open_item',
          itemId: focusId,
        });
        add({
          id: 'fu-def-preview',
          label: 'Preview as student',
          action: 'preview_student',
          itemId: focusId,
        });
      } else {
        add({
          id: 'fu-def-outline',
          label: 'Open outline',
          action: 'open_outline',
        });
      }
      if (unpublished.length > 0) {
        add({
          id: 'fu-def-pub',
          label: 'Publish unpublished quizzes',
          action: 'prompt',
          prompt: 'Publish all unpublished quizzes',
        });
      }
      break;
  }

  return out;
}

function shortTitle(title: string, max = 32): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
