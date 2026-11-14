import type { OutlineItemSummary } from "@/lib/authoring";
import type { OutlineItemBody } from "@/app/db/schema";

export type ArtifactTab = "outline" | "assignment" | "diff";

export type AuthoringSuggestedAction = {
  id: string;
  label: string;
  action:
    | "propose"
    | "approve_build"
    | "switch_up"
    | "open_outline"
    | "open_item"
    | "preview_student"
    | "publish"
    | "re_propose"
    | "show_artifact"
    | "prompt";
  itemId?: string;
  /** When action is `prompt`, send this as the next chat message. */
  prompt?: string;
};

export type AuthoringChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
  artifactRef?: {
    kind: "outline" | "item" | "switch_up";
    itemId?: string;
    label: string;
  };
  suggestedActions?: AuthoringSuggestedAction[];
};

export type SwitchDiff = {
  itemId: string;
  title: string;
  type: OutlineItemSummary["type"];
  before: OutlineItemBody;
  after: OutlineItemBody;
  similarity: number;
};

export type ItemPreview = {
  title: string;
  type: OutlineItemSummary["type"];
  body: OutlineItemBody;
  mode: "faculty" | "student";
};

export type RevisionSummary = {
  id: string;
  label: string;
  createdAt: string;
};

export type RolloverCheck = {
  code: string;
  severity: string;
  title: string;
  detail: string;
};

export type AuthoringSessionListItem = {
  id: string;
  title: string;
  status: string;
  brief: string | null;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Live agent progress for the chat thinking trace + artifact header. */
export type AuthoringProgress = {
  /** Header line, e.g. Updating "Virtual Memory" (3/13)… */
  label: string;
  /** Full step list for the expandable trace (no n/N suffix). */
  steps: string[];
  /** 0-based index of the step currently in flight. */
  index: number;
};

export function authoringProgressAt(
  steps: string[],
  index: number,
  fallbackLabel = "Working…",
): AuthoringProgress {
  if (steps.length === 0) {
    return { label: fallbackLabel, steps: [fallbackLabel], index: 0 };
  }
  const i = Math.min(Math.max(0, index), steps.length - 1);
  const step = steps[i]!;
  return {
    label: `${step} (${i + 1}/${steps.length})…`,
    steps,
    index: i,
  };
}

export function newMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function itemPublished(item: OutlineItemSummary) {
  return Boolean(
    item.publishedQuizId ||
      item.publishedChatbotId ||
      item.publishedLessonId ||
      item.publishedInteractiveId,
  );
}

/** Ready to publish inactive to the course (built body, not yet published). */
export function itemPublishable(item: OutlineItemSummary) {
  return !itemPublished(item) && !itemBodyIsStub(item);
}

export function itemBodyIsStub(item: OutlineItemSummary) {
  const body = item.body ?? {};
  if (item.type === "QUIZ") return !(body.questions && body.questions.length > 0);
  if (item.type === "DISCUSSION") {
    return !body.instructions?.trim() && !body.systemPrompt?.trim();
  }
  if (item.type === "INTERACTIVE") {
    return (
      !body.interactiveBody || Object.keys(body.interactiveBody).length === 0
    );
  }
  if (item.type === "LESSON") {
    // Shah chapters live on body.chapter; legacy lessons use body.markdown.
    const chapter = body.chapter;
    if (
      chapter &&
      typeof chapter === "object" &&
      (chapter as { kind?: string }).kind === "interactive_chapter"
    ) {
      const sections = (chapter as { sections?: unknown[] }).sections;
      const objectives = (chapter as { learningObjectives?: unknown[] })
        .learningObjectives;
      if (!Array.isArray(sections) || sections.length === 0) return true;
      if (!Array.isArray(objectives) || objectives.length === 0) return true;
      const hasReading = sections.some((s) => {
        if (!s || typeof s !== "object") return false;
        const md = (s as { markdown?: string }).markdown;
        return Boolean(md?.trim());
      });
      return !hasReading;
    }
    return !body.markdown?.trim();
  }
  return true;
}

export function outlineAssignmentStats(
  modules: Array<{ items: OutlineItemSummary[] }>,
) {
  const perModule = modules.map((mod) => mod.items.length);
  const total = perModule.reduce((sum, count) => sum + count, 0);
  const uniform =
    perModule.length > 0 && perModule.every((count) => count === perModule[0]);
  const byType: Record<OutlineItemSummary["type"], number> = {
    QUIZ: 0,
    DISCUSSION: 0,
    INTERACTIVE: 0,
    LESSON: 0,
  };
  for (const mod of modules) {
    for (const item of mod.items) byType[item.type] += 1;
  }
  return {
    total,
    perModule,
    uniform,
    each: perModule[0] ?? 0,
    byType,
  };
}

export function typeLabel(type: OutlineItemSummary["type"]) {
  switch (type) {
    case "LESSON":
      return "Lesson";
    case "QUIZ":
      return "Quiz";
    case "DISCUSSION":
      return "Discussion";
    case "INTERACTIVE":
      return "Interactive";
    default:
      return type;
  }
}

export function statusTone(status: string) {
  switch (status) {
    case "PUBLISHED":
    case "READY":
      return "border-brand/30 bg-brand/10 text-foreground";
    case "PREVIEW":
      return "border-border bg-muted/70 text-foreground";
    case "FAILED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}
