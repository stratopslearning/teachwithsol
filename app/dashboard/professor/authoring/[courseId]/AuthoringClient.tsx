"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiUrl } from "@/lib/basePath";
import type { OutlineDetail, OutlineItemSummary } from "@/lib/authoring";
import { buildAuthoringFollowUps } from "@/lib/authoring/agent/followUps";
import { buildOutlineInventory } from "@/lib/authoring/agent/inventory";
import {
  buildChatProgressPlan,
  looksLikeProposeOutlineRequest,
} from "@/lib/authoring/intent";
import type { OutlineItemBody } from "@/app/db/schema";
import { AuthoringArtifactStage } from "./AuthoringArtifactStage";
import { AuthoringChatPane } from "./AuthoringChatPane";
import { AuthoringWorkspaceShell } from "./AuthoringWorkspaceShell";
import type {
  AttachableDoc,
  CourseCorpusItem,
} from "./AuthoringMaterialsPanel";
import {
  authoringProgressAt,
  newMessageId,
  outlineAssignmentStats,
  typeLabel,
  type ArtifactTab,
  type AuthoringChatMessage,
  type AuthoringProgress,
  type AuthoringSessionListItem,
  type AuthoringSuggestedAction,
  type ItemPreview,
  type RevisionSummary,
  type RolloverCheck,
  type SwitchDiff,
} from "./types";

export default function AuthoringClient({
  courseId,
  courseTitle,
  initialOutline,
  initialMessages,
  initialSessions = [],
  materialsHref,
  materialsReady: initialMaterialsReady,
  materialsTotal: initialMaterialsTotal,
  attachableDocuments: initialAttachable = [],
  corpusItems: initialCorpus = [],
  initialRefineRevisionId = null,
  sectionOptions = [],
}: {
  courseId: string;
  courseTitle: string;
  initialOutline: OutlineDetail | null;
  initialMessages: Array<{ id?: string; role: "user" | "assistant"; content: string }>;
  initialSessions?: AuthoringSessionListItem[];
  materialsHref: string;
  materialsReady: number;
  materialsTotal: number;
  attachableDocuments?: AttachableDoc[];
  corpusItems?: CourseCorpusItem[];
  initialRefineRevisionId?: string | null;
  sectionOptions?: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [acting, setActing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [outline, setOutline] = useState(initialOutline);
  const [brief, setBrief] = useState(initialOutline?.brief ?? "");
  const [lastBrief, setLastBrief] = useState(initialOutline?.brief ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    initialOutline?.modules[0]?.items[0]?.id ?? null,
  );
  const [modulePage, setModulePage] = useState(0);
  const [typeFilter, setTypeFilter] = useState<
    "ALL" | OutlineItemSummary["type"]
  >("ALL");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<AuthoringChatMessage[]>(() =>
    hydrateMessages(initialMessages, initialOutline),
  );
  const [sessions, setSessions] =
    useState<AuthoringSessionListItem[]>(initialSessions);
  const [preview, setPreview] = useState<ItemPreview | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [publishSectionIds, setPublishSectionIds] = useState<string[]>(() =>
    sectionOptions.map((s) => s.id),
  );
  useEffect(() => {
    if (sectionOptions.length === 0) return;
    setPublishSectionIds((prev) => {
      const allowed = new Set(sectionOptions.map((s) => s.id));
      const kept = prev.filter((id) => allowed.has(id));
      if (kept.length > 0) return kept;
      return sectionOptions.map((s) => s.id);
    });
  }, [sectionOptions]);
  const [checks, setChecks] = useState<RolloverCheck[]>([]);
  const [switchDiffs, setSwitchDiffs] = useState<SwitchDiff[] | null>(null);
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>(
    initialOutline ? "outline" : "outline",
  );
  const [mobileArtifactOpen, setMobileArtifactOpen] = useState(false);
  // Closed by default — user opens the artifact from the chat toolbar.
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState<AuthoringProgress | null>(
    null,
  );
  const [materialsReady, setMaterialsReady] = useState(initialMaterialsReady);
  const [materialsTotal, setMaterialsTotal] = useState(initialMaterialsTotal);
  const [attachableDocuments, setAttachableDocuments] = useState(
    initialAttachable,
  );
  const [corpusItems, setCorpusItems] = useState(initialCorpus);
  /** Empty = agent uses full Ready corpus. */
  const [focusedMaterialIds, setFocusedMaterialIds] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  function openArtifactPanel() {
    setArtifactPanelOpen(true);
    // Mobile sheet only — on lg+ the side panel is already visible. Opening the
    // sheet there leaves a full-screen dim overlay with content hidden via lg:hidden.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      setMobileArtifactOpen(true);
    }
  }

  function stopInFlight() {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
    setChatting(false);
    setApproving(false);
    setBuildProgress(null);
  }

  useEffect(() => {
    setMaterialsReady(initialMaterialsReady);
    setMaterialsTotal(initialMaterialsTotal);
    setAttachableDocuments(initialAttachable);
    setCorpusItems(initialCorpus);
    // Drop focus ids that no longer exist in the corpus (e.g. legacy upload
    // rows replaced by mirrored library docs after refresh).
    const alive = new Set(initialCorpus.map((c) => c.id));
    setFocusedMaterialIds((prev) => {
      const next = prev.filter((id) => alive.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [
    initialMaterialsReady,
    initialMaterialsTotal,
    initialAttachable,
    initialCorpus,
  ]);

  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions]);

  // If the viewport grows to desktop, dismiss the mobile sheet so Radix
  // doesn't keep a focus trap / scroll lock with a hidden overlay.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const clearMobileSheet = () => {
      if (mq.matches) setMobileArtifactOpen(false);
    };
    clearMobileSheet();
    mq.addEventListener("change", clearMobileSheet);
    return () => mq.removeEventListener("change", clearMobileSheet);
  }, []);

  const moduleCount = outline?.modules.length ?? 0;
  useEffect(() => {
    if (!initialRefineRevisionId) return;
    setArtifactTab("outline");
    openArtifactPanel();
    setChatInput(
      `Refine authoring using insight revision ${initialRefineRevisionId}.`,
    );
    toast.message("Insight saved to authoring", {
      description: "Use chat to refine from the new revision snapshot.",
    });
  }, [initialRefineRevisionId]);

  const activeModule = outline?.modules[modulePage] ?? null;

  const selectedItem: OutlineItemSummary | null =
    outline?.modules
      .flatMap((m) => m.items)
      .find((i) => i.id === selectedItemId) ?? null;

  useEffect(() => {
    if (!outline || !selectedItemId) return;
    const idx = outline.modules.findIndex((m) =>
      m.items.some((i) => i.id === selectedItemId),
    );
    if (idx >= 0 && idx !== modulePage) setModulePage(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId, outline?.id]);

  useEffect(() => {
    if (modulePage >= moduleCount && moduleCount > 0) {
      setModulePage(0);
    }
  }, [moduleCount, modulePage]);

  const visibleItems = useMemo(() => {
    if (!activeModule) return [];
    if (typeFilter === "ALL") return activeModule.items;
    return activeModule.items.filter((i) => i.type === typeFilter);
  }, [activeModule, typeFilter]);

  const canGenerate = materialsReady > 0;
  const needsApproval =
    Boolean(outline) && outline!.status === "DRAFT" && !outline!.bodiesBuilt;
  const bodiesBuilt = Boolean(outline?.bodiesBuilt);
  const busy =
    pending || generating || chatting || acting || approving || historyBusy;
  const thinking = generating || chatting || approving;

  useEffect(() => {
    if (!outline?.id) return;
    void (async () => {
      try {
        const [revRes, checkRes] = await Promise.all([
          fetch(
            apiUrl(`/api/professor/authoring/outlines/${outline.id}/revisions`),
          ),
          fetch(
            apiUrl(`/api/professor/authoring/courses/${courseId}/checks`),
          ),
        ]);
        if (revRes.ok) {
          const data = await revRes.json();
          setRevisions(
            (data.revisions ?? []).map(
              (r: { id: string; label: string; createdAt: string }) => ({
                id: r.id,
                label: r.label,
                createdAt: r.createdAt,
              }),
            ),
          );
        }
        if (checkRes.ok) {
          const data = await checkRes.json();
          setChecks(data.findings ?? []);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [outline?.id, outline?.updatedAt, courseId]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function refreshSessions() {
    try {
      const res = await fetch(
        apiUrl(
          `/api/professor/authoring/outlines?courseId=${encodeURIComponent(courseId)}&includeArchived=1`,
        ),
      );
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const next = Array.isArray(data.outlines) ? data.outlines : [];
      setSessions(
        next.map(
          (s: {
            id: string;
            title: string;
            status: string;
            brief?: string | null;
            preview?: string | null;
            createdAt: string | Date;
            updatedAt: string | Date;
          }) => ({
            id: s.id,
            title: s.title,
            status: s.status,
            brief: s.brief ?? null,
            preview: s.preview ?? null,
            createdAt:
              typeof s.createdAt === "string"
                ? s.createdAt
                : new Date(s.createdAt).toISOString(),
            updatedAt:
              typeof s.updatedAt === "string"
                ? s.updatedAt
                : new Date(s.updatedAt).toISOString(),
          }),
        ),
      );
    } catch {
      /* ignore */
    }
  }

  function applyLoadedSession(
    nextOutline: OutlineDetail | null,
    nextMessages: Array<{
      id?: string;
      role: "user" | "assistant";
      content: string;
    }>,
  ) {
    setOutline(nextOutline);
    setBrief(nextOutline?.brief ?? "");
    setLastBrief(nextOutline?.brief ?? "");
    setPreview(null);
    setSwitchDiffs(null);
    setRevisions([]);
    setChecks([]);
    setModulePage(0);
    setTypeFilter("ALL");
    setSelectedItemId(nextOutline?.modules[0]?.items[0]?.id ?? null);
    setArtifactTab("outline");
    setArtifactPanelOpen(false);
    setChatInput("");
    setMessages(hydrateMessages(nextMessages, nextOutline));
  }

  async function onOpenSession(sessionId: string) {
    if (historyBusy || sessionId === outline?.id) return;
    setHistoryBusy(true);
    try {
      const session = sessions.find((s) => s.id === sessionId);
      const needsRestore = session?.status === "ARCHIVED";
      const res = await fetch(
        apiUrl(`/api/professor/authoring/outlines/${sessionId}${needsRestore ? "" : "?messages=1"}`),
        needsRestore
          ? {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ restore: true }),
            }
          : undefined,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Couldn’t open that chat");
        return;
      }
      applyLoadedSession(data.outline ?? null, data.messages ?? []);
      await refreshSessions();
      toast.message(needsRestore ? "Restored previous chat" : "Opened chat");
      refresh();
    } catch {
      toast.error("Couldn’t open that chat");
    } finally {
      setHistoryBusy(false);
    }
  }

  async function onStartNewChat() {
    if (historyBusy) return;
    if (outline) {
      if (
        !confirm(
          "Start a new authoring chat? The current draft stays in history and you can reopen it anytime.",
        )
      ) {
        return;
      }
    } else if (messages.length === 0) {
      return;
    }
    setHistoryBusy(true);
    try {
      if (outline) {
        const res = await fetch(
          apiUrl(`/api/professor/authoring/outlines/${outline.id}`),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ARCHIVED" }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Couldn’t archive current chat");
          return;
        }
      }
      applyLoadedSession(null, []);
      await refreshSessions();
      toast.message("New authoring chat");
      refresh();
    } catch {
      toast.error("Couldn’t start a new chat");
    } finally {
      setHistoryBusy(false);
    }
  }

  function focusPayload() {
    return focusedMaterialIds.length > 0
      ? { materialIds: focusedMaterialIds }
      : {};
  }

  function onMaterialsChanged(opts?: { attachedDocId?: string }) {
    if (opts?.attachedDocId) {
      const attached = attachableDocuments.find(
        (d) => d.id === opts.attachedDocId,
      );
      setAttachableDocuments((prev) =>
        prev.filter((d) => d.id !== opts.attachedDocId),
      );
      setMaterialsTotal((n) => n + 1);
      setMaterialsReady((n) => n + 1);
      if (attached) {
        setCorpusItems((prev) => [
          ...prev,
          {
            id: attached.id,
            title: attached.title,
            status: "READY",
            kind: "library",
          },
        ]);
      }
      appendMessage({
        role: "system",
        content:
          "Library document attached. Prompt to draft, or leave Materials closed — SOL uses the full Ready corpus unless you focus specific docs.",
      });
    } else {
      setMaterialsTotal((n) => n + 1);
      appendMessage({
        role: "system",
        content:
          "File uploaded and queued for indexing. When it turns Ready, prompt SOL to draft — or open Materials to focus specific docs.",
      });
    }
    refresh();
  }

  function appendMessage(msg: Omit<AuthoringChatMessage, "id"> & { id?: string }) {
    setMessages((prev) => [
      ...prev,
      {
        ...msg,
        id: msg.id ?? newMessageId(),
        createdAt: msg.createdAt ?? new Date().toISOString(),
      },
    ]);
  }

  function selectModule(index: number) {
    if (!outline) return;
    const next = Math.max(0, Math.min(index, outline.modules.length - 1));
    setModulePage(next);
    setTypeFilter("ALL");
    const first = outline.modules[next]?.items[0];
    if (first) setSelectedItemId(first.id);
  }

  function openOutlineArtifact() {
    setArtifactTab("outline");
    openArtifactPanel();
  }

  function openItemArtifact(itemId: string) {
    setSelectedItemId(itemId);
    setPreview(null);
    setArtifactTab("assignment");
    openArtifactPanel();
  }

  async function onSaveItemTitle(itemId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    setActing(true);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/items/${itemId}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not save title");
        return;
      }
      setOutline((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          modules: prev.modules.map((m) => ({
            ...m,
            items: m.items.map((i) =>
              i.id === itemId ? { ...i, title: data.item?.title ?? trimmed } : i,
            ),
          })),
        };
      });
      toast.success("Title saved");
    } catch {
      toast.error("Could not save title");
    } finally {
      setActing(false);
    }
  }

  async function onSaveItemBody(
    itemId: string,
    body: OutlineItemBody,
    opts?: { silent?: boolean },
  ) {
    setActing(true);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/items/${itemId}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not save settings");
        return;
      }
      const saved = (data.item ?? null) as OutlineItemSummary | null;
      setOutline((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          modules: prev.modules.map((m) => ({
            ...m,
            items: m.items.map((i) =>
              i.id === itemId
                ? saved
                  ? { ...i, ...saved }
                  : { ...i, body }
                : i,
            ),
          })),
        };
      });
      if (!opts?.silent) toast.success("Quiz settings saved");
    } catch {
      toast.error("Could not save settings");
    } finally {
      setActing(false);
    }
  }

  async function runGenerate(opts?: {
    briefOverride?: string;
    confirmReplace?: boolean;
    /** Retry in place — keep the existing user turn, don't append another. */
    skipAppendUser?: boolean;
  }) {
    const nextBrief =
      opts?.briefOverride !== undefined
        ? opts.briefOverride.trim()
        : (chatInput.trim() || brief.trim());

    if (
      !opts?.confirmReplace &&
      !opts?.skipAppendUser &&
      chatInput.trim()
    ) {
      appendMessage({ role: "user", content: chatInput.trim() });
      setChatInput("");
    }

    if (!canGenerate) {
      appendMessage({
        role: "system",
        content:
          "Add at least one Ready material before proposing an outline. Use + to upload or attach Knowledge docs — empty focus is fine (all Ready materials are used).",
      });
      toast.error("Add at least one Ready material first");
      return;
    }
    if (opts?.confirmReplace && outline) {
      if (
        !confirm(
          "Regenerate a new outline from materials? This archives the current draft. Refine chat edits the current draft instead.",
        )
      ) {
        return;
      }
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setGenerating(true);
    const generateSteps = buildGenerateProgressSteps({
      courseTitle,
      corpusItems,
      focusedMaterialIds,
      brief: nextBrief,
    });
    let generateIndex = 0;
    setBuildProgress(authoringProgressAt(generateSteps, 0));
    const generateTick = window.setInterval(() => {
      generateIndex = Math.min(generateIndex + 1, generateSteps.length - 1);
      setBuildProgress(authoringProgressAt(generateSteps, generateIndex));
    }, 1600);
    try {
      const res = await fetch(apiUrl("/api/professor/authoring/outlines"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          courseId,
          brief: nextBrief || undefined,
          ...focusPayload(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raw =
          typeof data.error === "string" ? data.error.trim() : "";
        const technical =
          /invalid generated outline|couldn't design a valid outline|failed to generate|schema error|validation|missing tenant/i.test(
            raw,
          );
        const message =
          technical || !raw
            ? "Outline didn’t come together — try generating again."
            : raw;
        appendMessage({
          role: "assistant",
          content: message,
          suggestedActions: [
            {
              id: "retry-propose",
              label: "Try again",
              action: "propose",
            },
          ],
        });
        toast.error(message);
        return;
      }
      setOutline(data.outline);
      setLastBrief(nextBrief);
      setBrief(nextBrief);
      setPreview(null);
      setSwitchDiffs(null);
      setModulePage(0);
      setTypeFilter("ALL");
      setSelectedItemId(data.outline?.modules?.[0]?.items?.[0]?.id ?? null);
      setArtifactTab("outline");

      const built = Boolean(data.outline?.bodiesBuilt);
      const itemCount =
        data.outline?.modules?.reduce(
          (n: number, m: { items?: unknown[] }) => n + (m.items?.length ?? 0),
          0,
        ) ?? 0;
      appendMessage({
        role: "assistant",
        content: built
          ? `Outline and ${itemCount || "all"} assignments ready for review.`
          : "Outline structure is ready, but assignments didn’t finish writing. Open Approve & build to complete them.",
        artifactRef: {
          kind: "outline",
          label: data.outline?.title || "Course outline",
        },
        suggestedActions: built
          ? [
              {
                id: "open-outline",
                label: "Open outline",
                action: "open_outline",
              },
            ]
          : [
              {
                id: "approve",
                label: "Approve & build",
                action: "approve_build",
              },
              {
                id: "open-outline",
                label: "Open outline",
                action: "open_outline",
              },
            ],
      });
      toast.success(
        built
          ? "Outline and assignments ready"
          : "Outline ready — finish building assignments",
      );
      void refreshSessions();
      refresh();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      toast.error("Generation failed");
    } finally {
      window.clearInterval(generateTick);
      if (abortRef.current === ac) abortRef.current = null;
      setGenerating(false);
      setBuildProgress(null);
    }
  }

  async function onApproveBuild() {
    if (!outline) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setApproving(true);
    const buildItems = outline.modules.flatMap((m) => m.items);
    const total = buildItems.length;
    const buildSteps =
      total === 0
        ? ["Building assignments"]
        : buildItems.map((item) => `Building “${item.title}”`);
    let buildIndex = 0;
    const showBuild = (i: number) => {
      setBuildProgress(
        authoringProgressAt(buildSteps, i, "Building assignments…"),
      );
    };
    showBuild(0);
    const tick = window.setInterval(() => {
      buildIndex = Math.min(buildIndex + 1, Math.max(total - 1, 0));
      showBuild(buildIndex);
    }, 900);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/outlines/${outline.id}/approve`),
        { method: "POST", signal: ac.signal },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Approve & build failed");
        return;
      }
      setOutline(data.outline);
      appendMessage({
        role: "assistant",
        content:
          total > 0
            ? `${total} assignments ready for review.`
            : "Assignments ready for review.",
        artifactRef: {
          kind: "outline",
          label: data.outline?.title || "Course outline",
        },
        suggestedActions: [
          {
            id: "open-outline-built",
            label: "Open outline",
            action: "open_outline",
          },
        ],
      });
      toast.success(
        total > 0
          ? `${total} assignments ready for review`
          : "Assignments ready for review",
      );
      refresh();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      toast.error("Approve & build failed");
    } finally {
      window.clearInterval(tick);
      setBuildProgress(null);
      if (abortRef.current === ac) abortRef.current = null;
      setApproving(false);
    }
  }

  async function onRestoreRevision(revisionId: string) {
    if (!outline) return;
    if (!confirm("Restore this revision? Current state is snapshotted first.")) {
      return;
    }
    setActing(true);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/outlines/${outline.id}/revisions`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revisionId }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Restore failed");
        return;
      }
      setOutline(data.outline);
      appendMessage({
        role: "system",
        content: "Revision restored. Outline artifact updated.",
        artifactRef: {
          kind: "outline",
          label: data.outline?.title || "Course outline",
        },
      });
      toast.success("Revision restored");
      refresh();
    } catch {
      toast.error("Restore failed");
    } finally {
      setActing(false);
    }
  }

  async function onProposeSwitchUp() {
    if (!outline) return;
    setActing(true);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/outlines/${outline.id}/switch-up`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemIds: selectedItemId ? [selectedItemId] : undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Switch up failed");
        return;
      }
      setSwitchDiffs(data.diffs ?? []);
      setArtifactTab("diff");
      openArtifactPanel();
      appendMessage({
        role: "assistant",
        content: "Switch-up variants ready. Review the side-by-side diff artifact, then accept or discard.",
        artifactRef: {
          kind: "switch_up",
          label: selectedItem?.title || "Switch-up variants",
          itemId: selectedItemId || undefined,
        },
      });
      toast.success("Review switch-up variants side by side");
    } catch {
      toast.error("Switch up failed");
    } finally {
      setActing(false);
    }
  }

  async function onAcceptSwitchUp() {
    if (!outline || !switchDiffs?.length) return;
    setActing(true);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/outlines/${outline.id}/switch-up`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "accept",
            items: switchDiffs.map((d) => ({
              itemId: d.itemId,
              title: d.title,
              body: d.after,
            })),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not apply switch up");
        return;
      }
      setOutline(data.outline);
      setSwitchDiffs(null);
      setArtifactTab(
        selectedItemId ? "assignment" : "outline",
      );
      appendMessage({
        role: "system",
        content: "Switch up applied. Assignment artifacts updated.",
      });
      toast.success("Switch up applied");
      refresh();
    } catch {
      toast.error("Could not apply switch up");
    } finally {
      setActing(false);
    }
  }

  async function onRegenerate() {
    await runGenerate({
      briefOverride: lastBrief || outline?.brief || brief,
      confirmReplace: true,
    });
  }

  async function runRefine(
    message: string,
    opts?: { skipAppendUser?: boolean },
  ) {
    if (!outline) return;

    if (needsApproval || !bodiesBuilt) {
      if (!opts?.skipAppendUser) {
        setChatInput("");
        appendMessage({ role: "user", content: message });
      }
      appendMessage({
        role: "assistant",
        content:
          "Approve & build the outline first — then I can refine quizzes, lessons, and discussions from your message.",
        artifactRef: {
          kind: "outline",
          label: outline.title || "Course outline",
        },
        suggestedActions: [
          {
            id: `approve-${newMessageId()}`,
            label: "Approve & build",
            action: "approve_build",
          },
          {
            id: `open-outline-${newMessageId()}`,
            label: "Open outline",
            action: "open_outline",
          },
        ],
      });
      return;
    }

    if (!opts?.skipAppendUser) {
      setChatInput("");
      appendMessage({ role: "user", content: message });
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setChatting(true);

    const focusItemId =
      artifactTab === "assignment" && selectedItemId
        ? selectedItemId
        : undefined;
    const progressTimer = startChatActionProgress({
      outline,
      message,
      focusItemId,
      setBuildProgress,
    });

    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/outlines/${outline.id}/chat`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({
            message,
            focusItemId,
            ...focusPayload(),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg =
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : "Refine failed";
        appendMessage({
          role: "assistant",
          content: errMsg,
        });
        toast.error(errMsg);
        return;
      }
      setOutline(data.outline);

      const patchedIds: string[] = Array.isArray(data.patchedItemIds)
        ? data.patchedItemIds
        : [];
      const publishedIds: string[] = Array.isArray(data.publishedItemIds)
        ? data.publishedItemIds
        : [];
      const releasedIds: string[] = Array.isArray(data.releasedItemIds)
        ? data.releasedItemIds
        : [];
      const focusPatched =
        patchedIds[0] ||
        publishedIds[0] ||
        releasedIds[0] ||
        (artifactTab === "assignment" ? selectedItemId : null);

      let focusItem: OutlineItemSummary | null = null;
      if (focusPatched && data.outline) {
        focusItem =
          data.outline.modules
            .flatMap((m: OutlineDetail["modules"][number]) => m.items)
            .find((i: OutlineItemSummary) => i.id === focusPatched) ?? null;
        if (focusItem) {
          // Update selection for when the user opens the artifact; don't auto-open.
          setSelectedItemId(focusItem.id);
          setArtifactTab("assignment");
          setPreview(null);
          setHighlightItemId(focusItem.id);
          window.setTimeout(() => setHighlightItemId(null), 1600);
        }
      }

      const nextOutline = (data.outline as OutlineDetail | undefined) ?? outline;
      const inventory = buildOutlineInventory(
        nextOutline,
        focusItem?.id ?? selectedItemId ?? undefined,
      );
      const suggestedActions: AuthoringSuggestedAction[] =
        buildAuthoringFollowUps({
          userMessage: message,
          inventory,
          patchedItemIds: patchedIds,
          publishedItemIds: publishedIds,
          releasedItemIds: releasedIds,
          focusItemId: focusItem?.id ?? null,
          focusTitle: focusItem?.title ?? null,
          needsApproval,
          bodiesBuilt: Boolean(nextOutline?.bodiesBuilt),
        }).map((fu) => ({
          id: `${fu.id}-${newMessageId()}`,
          label: fu.label,
          action: fu.action,
          itemId: fu.itemId,
          prompt: fu.prompt,
        }));

      appendMessage({
        role: "assistant",
        content: data.assistantMessage,
        artifactRef: focusItem
          ? {
              kind: "item",
              itemId: focusItem.id,
              label: `${typeLabel(focusItem.type)} · ${focusItem.title}`,
            }
          : {
              kind: "outline",
              label: data.outline?.title || "Course outline",
            },
        suggestedActions,
      });

      if (publishedIds.length > 0 && releasedIds.length > 0) {
        toast.success(
          `Published ${publishedIds.length}, released ${releasedIds.length}`,
        );
        refresh();
      } else if (publishedIds.length > 0) {
        toast.success(
          publishedIds.length === 1
            ? "Published as inactive draft"
            : `Published ${publishedIds.length} inactive drafts`,
        );
        refresh();
      } else if (releasedIds.length > 0) {
        toast.success(
          releasedIds.length === 1
            ? "Released to students"
            : `Released ${releasedIds.length} assignments`,
        );
        refresh();
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      toast.error("Refine failed");
    } finally {
      if (progressTimer != null) window.clearInterval(progressTimer);
      setBuildProgress(null);
      if (abortRef.current === ac) abortRef.current = null;
      setChatting(false);
    }
  }

  async function onChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message) return;

    // No outline yet → treat send as propose (brief = message)
    if (!outline) {
      await runGenerate({ briefOverride: message });
      return;
    }

    // “Propose an outline for …” with an existing draft → rebuild, don’t clarify quizzes.
    if (looksLikeProposeOutlineRequest(message)) {
      await runGenerate({
        briefOverride: message,
        confirmReplace: true,
      });
      return;
    }

    await runRefine(message);
  }

  /** Claude-style retry: keep the user turn, drop later replies, regenerate. */
  function onRetryMessage(messageId: string) {
    if (busy) return;
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;

    let userIdx = idx;
    let userMsg = messages[idx];
    if (userMsg?.role === "assistant" || userMsg?.role === "system") {
      const prev = [...messages]
        .slice(0, idx)
        .reverse()
        .find((m) => m.role === "user");
      if (!prev) return;
      userIdx = messages.findIndex((m) => m.id === prev.id);
      userMsg = prev;
    }
    if (!userMsg || userMsg.role !== "user" || userIdx < 0) return;

    setMessages((prev) => prev.slice(0, userIdx + 1));

    if (!outline) {
      void runGenerate({
        briefOverride: userMsg.content,
        skipAppendUser: true,
      });
      return;
    }

    void runRefine(userMsg.content, { skipAppendUser: true });
  }

  async function onPreview(mode: "faculty" | "student" = "faculty") {
    if (!selectedItem) return;
    setActing(true);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/items/${selectedItem.id}/preview`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Preview failed");
        return;
      }
      setOutline((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          modules: prev.modules.map((m) => ({
            ...m,
            items: m.items.map((i) =>
              i.id === data.item.id ? data.item : i,
            ),
          })),
        };
      });
      const p = data.preview;
      const type = (p.type || selectedItem.type) as OutlineItemSummary["type"];
      const body: OutlineItemBody =
        type === "LESSON"
          ? {
              markdown: p.markdown || selectedItem.body?.markdown,
              flashcards:
                p.flashcards || selectedItem.body?.flashcards || [],
            }
          : type === "QUIZ"
            ? {
                questions: p.questions || selectedItem.body?.questions || [],
                maxAttempts: selectedItem.body?.maxAttempts,
                passingScore: selectedItem.body?.passingScore,
                timeLimit: selectedItem.body?.timeLimit,
                startDate: selectedItem.body?.startDate,
                endDate: selectedItem.body?.endDate,
              }
            : type === "DISCUSSION"
              ? {
                  personaName: p.personaName || selectedItem.body?.personaName,
                  instructions:
                    p.instructions || selectedItem.body?.instructions,
                  systemPrompt:
                    mode === "faculty"
                      ? p.systemPrompt || selectedItem.body?.systemPrompt
                      : undefined,
                }
              : {
                  interactiveKind:
                    p.interactiveKind || selectedItem.body?.interactiveKind,
                  interactiveBody:
                    p.interactiveBody ||
                    p.body ||
                    selectedItem.body?.interactiveBody,
                  description: selectedItem.body?.description,
                };
      setPreview({ title: p.title, type, body, mode });
      setArtifactTab("assignment");
      toast.success(
        mode === "student" ? "Student preview ready" : "Instructor preview ready",
      );
    } catch {
      toast.error("Preview failed");
    } finally {
      setActing(false);
    }
  }

  async function onPublish() {
    if (!selectedItem) return;
    if (sectionOptions.length > 0 && publishSectionIds.length === 0) {
      toast.error("Select at least one section to publish into");
      return;
    }
    setActing(true);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/items/${selectedItem.id}/publish`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionIds: publishSectionIds }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Publish failed");
        return;
      }
      setOutline((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          modules: prev.modules.map((m) => ({
            ...m,
            items: m.items.map((i) =>
              i.id === data.item.id ? data.item : i,
            ),
          })),
        };
      });
      appendMessage({
        role: "system",
        content: `Published “${selectedItem.title}” as an inactive draft. Release when students should see it.`,
        artifactRef: {
          kind: "item",
          itemId: selectedItem.id,
          label: selectedItem.title,
        },
      });
      toast.success("Published as inactive draft");
      refresh();
    } catch {
      toast.error("Publish failed");
    } finally {
      setActing(false);
    }
  }

  async function onPublishSelected(itemIds: string[]) {
    if (!outline || itemIds.length === 0) return;
    if (sectionOptions.length > 0 && publishSectionIds.length === 0) {
      toast.error("Select at least one section to publish into");
      return;
    }
    setActing(true);
    const ac = new AbortController();
    const kill = window.setTimeout(() => ac.abort(), 120_000);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/outlines/${outline.id}/publish`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemIds,
            sectionIds: publishSectionIds,
          }),
          signal: ac.signal,
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Publish failed");
        return;
      }
      const published = (data.published ?? []) as OutlineItemSummary[];
      const failed = (data.failed ?? []) as Array<{
        itemId: string;
        title: string | null;
        error: string;
      }>;
      if (published.length > 0) {
        const byId = new Map(published.map((item) => [item.id, item]));
        setOutline((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            modules: prev.modules.map((m) => ({
              ...m,
              items: m.items.map((i) => byId.get(i.id) ?? i),
            })),
          };
        });
        appendMessage({
          role: "system",
          content: `Published ${published.length} assignment${published.length === 1 ? "" : "s"} as inactive drafts. Release when students should see them.`,
        });
      }
      if (failed.length === 0) {
        toast.success(
          published.length === 1
            ? "Published as inactive draft"
            : `Published ${published.length} assignments`,
        );
      } else if (published.length === 0) {
        const sample = failed
          .slice(0, 2)
          .map((f) => (f.title ? `“${f.title}”: ${f.error}` : f.error))
          .join(" · ");
        toast.error(
          sample ||
            `Could not publish ${failed.length} assignment${failed.length === 1 ? "" : "s"}`,
        );
      } else {
        toast.warning(
          `Published ${published.length}, ${failed.length} failed${
            failed[0]?.error ? ` (${failed[0].error})` : ""
          }`,
        );
      }
      refresh();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        toast.error("Publish timed out — try fewer items, or one at a time");
      } else {
        toast.error("Publish failed");
      }
    } finally {
      window.clearTimeout(kill);
      setActing(false);
    }
  }

  async function onRelease() {
    if (!selectedItem) return;
    if (
      !confirm(
        "Release to students? They will see this assignment immediately.",
      )
    ) {
      return;
    }
    setActing(true);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/authoring/items/${selectedItem.id}/release`),
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Release failed");
        return;
      }
      appendMessage({
        role: "system",
        content: `Released “${selectedItem.title}” to students.`,
      });
      toast.success("Released to students");
      refresh();
    } catch {
      toast.error("Release failed");
    } finally {
      setActing(false);
    }
  }

  function onSuggestedAction(action: AuthoringSuggestedAction) {
    switch (action.action) {
      case "propose":
        void runGenerate({
          briefOverride: chatInput.trim() || lastBrief || brief,
        });
        break;
      case "re_propose":
        void onRegenerate();
        break;
      case "approve_build":
        void onApproveBuild();
        break;
      case "switch_up":
        if (switchDiffs?.length) {
          setArtifactTab("diff");
          openArtifactPanel();
        } else {
          void onProposeSwitchUp();
        }
        break;
      case "open_outline":
        openOutlineArtifact();
        break;
      case "open_item":
        if (action.itemId) openItemArtifact(action.itemId);
        break;
      case "preview_student":
        if (action.itemId) {
          setSelectedItemId(action.itemId);
          setArtifactTab("assignment");
          openArtifactPanel();
        }
        void onPreview("student");
        break;
      case "publish":
        void onPublish();
        break;
      case "show_artifact":
        openArtifactPanel();
        break;
      case "prompt": {
        const text = action.prompt?.trim();
        if (!text || busy) return;
        void runRefine(text);
        break;
      }
      default:
        break;
    }
  }

  const warningChecks = checks.filter((c) => c.severity === "warning");
  const focusLabel = selectedItem
    ? `${typeLabel(selectedItem.type)} “${selectedItem.title}”`
    : null;

  function renderArtifactStage(opts?: { showClose?: boolean }) {
    return (
      <AuthoringArtifactStage
        outline={outline}
        selectedItem={selectedItem}
        selectedItemId={selectedItemId}
        onSelectItem={(itemId) => {
          openItemArtifact(itemId);
        }}
        artifactTab={artifactTab}
        onArtifactTabChange={setArtifactTab}
        modulePage={modulePage}
        onModulePageChange={selectModule}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        visibleItems={visibleItems}
        needsApproval={needsApproval}
        busy={busy}
        generating={generating}
        approving={approving}
        preview={preview}
        onClearPreview={() => setPreview(null)}
        switchDiffs={switchDiffs}
        revisions={revisions}
        onApproveBuild={() => void onApproveBuild()}
        onProposeSwitchUp={() => void onProposeSwitchUp()}
        onAcceptSwitchUp={() => void onAcceptSwitchUp()}
        onDiscardSwitchUp={() => {
          setSwitchDiffs(null);
          setArtifactTab(selectedItemId ? "assignment" : "outline");
        }}
        onRegenerate={() => void onRegenerate()}
        onPreview={(mode) => void onPreview(mode)}
        onPublish={() => void onPublish()}
        onPublishSelected={(ids) => void onPublishSelected(ids)}
        onRelease={() => void onRelease()}
        sectionOptions={sectionOptions}
        publishSectionIds={publishSectionIds}
        onPublishSectionIdsChange={setPublishSectionIds}
        onRestoreRevision={(id) => void onRestoreRevision(id)}
        onCloseMobile={() => {
          setMobileArtifactOpen(false);
          setArtifactPanelOpen(false);
        }}
        onClosePanel={() => setArtifactPanelOpen(false)}
        showClose={opts?.showClose}
        highlightItemId={highlightItemId}
        onSaveItemTitle={(id, title) => void onSaveItemTitle(id, title)}
        onSaveItemBody={(id, body, opts) => onSaveItemBody(id, body, opts)}
        onAskAboutItem={(itemId) => {
          openItemArtifact(itemId);
          const item = outline?.modules
            .flatMap((m) => m.items)
            .find((i) => i.id === itemId);
          if (item) {
            setChatInput(`Make “${item.title}” harder and clearer.`);
          }
        }}
        buildProgress={buildProgress?.label ?? null}
      />
    );
  }

  const artifactOpen = Boolean(outline) && artifactPanelOpen;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {warningChecks.length > 0 ? (
        <div className="mx-4 mt-3 shrink-0 rounded-2xl border border-amber-500/40 bg-surface px-4 py-3 text-sm shadow-sm">
          <p className="font-medium text-ink">
            Before you publish — {warningChecks.length} check
            {warningChecks.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-ink-muted">
            {warningChecks.slice(0, 5).map((c, i) => (
              <li key={`${c.code}-${i}`}>
                <span className="text-ink">{c.title}</span> — {c.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AuthoringWorkspaceShell
        artifactOpen={artifactOpen}
        conversation={
          <AuthoringChatPane
            courseId={courseId}
            courseTitle={courseTitle}
            materialsHref={materialsHref}
            materialsReady={materialsReady}
            materialsTotal={materialsTotal}
            attachableDocuments={attachableDocuments}
            corpusItems={corpusItems}
            focusedMaterialIds={focusedMaterialIds}
            onFocusedMaterialIdsChange={setFocusedMaterialIds}
            onMaterialsChanged={onMaterialsChanged}
            messages={messages}
            chatInput={chatInput}
            onChatInputChange={setChatInput}
            onSubmit={(e) => void onChatSubmit(e)}
            onAction={onSuggestedAction}
            onRetryMessage={onRetryMessage}
            onOpenArtifact={openArtifactPanel}
            onToggleArtifact={() => {
              if (artifactPanelOpen) {
                setArtifactPanelOpen(false);
                setMobileArtifactOpen(false);
              } else {
                openArtifactPanel();
              }
            }}
            onOpenOutline={openOutlineArtifact}
            onCloseArtifact={() => {
              setArtifactPanelOpen(false);
              setMobileArtifactOpen(false);
            }}
            onStop={stopInFlight}
            sessions={sessions}
            activeSessionId={outline?.id ?? null}
            onOpenSession={(id) => void onOpenSession(id)}
            onStartNewChat={() => void onStartNewChat()}
            historyBusy={historyBusy}
            busy={busy}
            chatting={chatting}
            thinking={thinking}
            generating={generating}
            approving={approving}
            canPropose={canGenerate}
            hasOutline={Boolean(outline)}
            needsApproval={needsApproval}
            bodiesBuilt={bodiesBuilt}
            focusLabel={artifactTab === "assignment" ? focusLabel : null}
            showMobileArtifactButton={Boolean(outline) && !artifactPanelOpen}
            artifactOpen={artifactOpen}
            toolStatus={buildProgress?.label ?? null}
            progress={buildProgress}
          />
        }
        artifact={renderArtifactStage({ showClose: true })}
      />

      <Sheet
        open={mobileArtifactOpen && Boolean(outline)}
        onOpenChange={setMobileArtifactOpen}
      >
        <SheetContent
          side="bottom"
          className="flex h-[min(92vh,44rem)] flex-col gap-0 p-0 lg:hidden"
          overlayClassName="lg:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Authoring artifact</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 p-2">
            {renderArtifactStage({ showClose: true })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function hydrateMessages(
  initial: Array<{ id?: string; role: "user" | "assistant"; content: string }>,
  outline: OutlineDetail | null,
): AuthoringChatMessage[] {
  const mapped: AuthoringChatMessage[] = initial.map((m) => ({
    id: m.id ?? newMessageId(),
    role: m.role,
    content: m.content,
  }));

  // Older proposes never wrote authoring_messages — rebuild a minimal thread
  // from the outline brief so history / reopen aren't blank.
  if (outline && mapped.length === 0) {
    const brief = outline.brief?.trim();
    if (brief) {
      mapped.push({
        id: newMessageId(),
        role: "user",
        content: brief,
      });
    }
    mapped.push({
      id: newMessageId(),
      role: "assistant",
      content: outline.bodiesBuilt
        ? "Outline ready — open the artifact to review assignments, or refine in chat."
        : "Outline skeleton ready — open the artifact to review structure, then approve & build.",
      artifactRef: {
        kind: "outline",
        label: outline.title,
      },
      suggestedActions: outline.bodiesBuilt
        ? [
            {
              id: "hydrate-open",
              label: "Open outline",
              action: "open_outline",
            },
          ]
        : [
            {
              id: "hydrate-approve",
              label: "Approve & build",
              action: "approve_build",
            },
            {
              id: "hydrate-open",
              label: "Open outline",
              action: "open_outline",
            },
          ],
    });
  } else if (outline && mapped.length > 0) {
    const hasArtifactCue = mapped.some(
      (m) => m.role === "assistant" || m.role === "system",
    );
    if (hasArtifactCue) {
      const last = mapped[mapped.length - 1];
      if (last && last.role === "assistant" && !last.artifactRef) {
        last.artifactRef = {
          kind: "outline",
          label: outline.title,
        };
        last.suggestedActions = last.suggestedActions?.length
          ? last.suggestedActions
          : [
              {
                id: "hydrate-resume",
                label: "Open outline",
                action: "open_outline",
              },
            ];
      }
    }
  }

  return mapped;
}

/** Same concrete title+(n/N) progress for every chat prompt. */
function startChatActionProgress(opts: {
  outline: OutlineDetail;
  message: string;
  focusItemId?: string;
  setBuildProgress: (value: AuthoringProgress | null) => void;
}): number | null {
  const plan = buildChatProgressPlan(
    opts.outline,
    opts.message,
    opts.focusItemId,
  );
  if (plan.steps.length === 0) {
    opts.setBuildProgress({
      label: plan.idleLabel,
      steps: [plan.idleLabel.replace(/…$/, "")],
      index: 0,
    });
    return null;
  }

  let index = 0;
  const show = (i: number) => {
    opts.setBuildProgress(authoringProgressAt(plan.steps, i));
  };
  show(0);
  return window.setInterval(() => {
    index = Math.min(index + 1, plan.steps.length - 1);
    show(index);
  }, 1600);
}

function buildGenerateProgressSteps(opts: {
  courseTitle: string;
  corpusItems: CourseCorpusItem[];
  focusedMaterialIds: string[];
  brief: string;
}): string[] {
  const focused =
    opts.focusedMaterialIds.length > 0
      ? opts.corpusItems.filter((c) =>
          opts.focusedMaterialIds.includes(c.id),
        )
      : opts.corpusItems.filter((c) => c.status === "READY").slice(0, 8);
  const materialSteps = focused.map(
    (c) => `Reading “${c.title.slice(0, 60)}${c.title.length > 60 ? "…" : ""}”`,
  );
  return [
    `Planning outline for ${opts.courseTitle}`,
    ...(materialSteps.length > 0
      ? materialSteps
      : ["Reading course materials"]),
    opts.brief.trim()
      ? `Applying brief: “${opts.brief.trim().slice(0, 48)}${
          opts.brief.trim().length > 48 ? "…" : ""
        }”`
      : "Structuring modules and assignments",
    "Drafting the outline",
  ];
}

function approvalSummary(outline: OutlineDetail | null) {
  if (!outline) {
    return "Review the outline, then approve to write the assignments.";
  }
  const stats = outlineAssignmentStats(outline.modules);
  const shape =
    stats.uniform && stats.each > 0
      ? `Each of the ${outline.modules.length} modules has ${stats.each} assignments (${stats.total} total).`
      : `${stats.total} assignments across ${outline.modules.length} modules.`;
  const source = outline.hasPriorCorpus
    ? "Approve to write them from last term’s materials."
    : "Approve to write the quizzes, discussions, and practice.";
  return `${shape} ${source}`;
}
