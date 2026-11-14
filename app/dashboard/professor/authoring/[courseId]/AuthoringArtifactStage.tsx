"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  X,
} from "@/components/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SectionMultiSelect } from "@/components/ui/SectionMultiSelect";
import type { OutlineDetail, OutlineItemSummary } from "@/lib/authoring";
import { cn } from "@/lib/utils";

import { OutlineItemBodyView } from "./OutlineItemBodyView";
import {
  QuizSettingsEditor,
  type QuizSettingsValues,
} from "./QuizSettingsEditor";
import {
  itemBodyIsStub,
  itemPublishable,
  itemPublished,
  outlineAssignmentStats,
  statusTone,
  typeLabel,
  type ArtifactTab,
  type ItemPreview,
  type RevisionSummary,
  type SwitchDiff,
} from "./types";

export function AuthoringArtifactStage({
  outline,
  selectedItem,
  selectedItemId,
  onSelectItem,
  artifactTab,
  onArtifactTabChange,
  modulePage,
  onModulePageChange,
  typeFilter,
  onTypeFilterChange,
  visibleItems,
  needsApproval,
  busy,
  generating,
  approving,
  preview,
  onClearPreview,
  switchDiffs,
  revisions,
  onApproveBuild,
  onProposeSwitchUp,
  onAcceptSwitchUp,
  onDiscardSwitchUp,
  onRegenerate,
  onPreview,
  onPublish,
  onPublishSelected = () => {},
  onRelease,
  sectionOptions = [],
  publishSectionIds = [],
  onPublishSectionIdsChange = () => {},
  onRestoreRevision,
  onCloseMobile,
  onClosePanel,
  showClose,
  highlightItemId = null,
  onSaveItemTitle,
  onSaveItemBody,
  onAskAboutItem,
  buildProgress = null,
}: {
  outline: OutlineDetail | null;
  selectedItem: OutlineItemSummary | null;
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  artifactTab: ArtifactTab;
  onArtifactTabChange: (tab: ArtifactTab) => void;
  modulePage: number;
  onModulePageChange: (page: number) => void;
  typeFilter: "ALL" | OutlineItemSummary["type"];
  onTypeFilterChange: (filter: "ALL" | OutlineItemSummary["type"]) => void;
  visibleItems: OutlineItemSummary[];
  needsApproval: boolean;
  busy: boolean;
  generating: boolean;
  approving: boolean;
  preview: ItemPreview | null;
  onClearPreview: () => void;
  switchDiffs: SwitchDiff[] | null;
  revisions: RevisionSummary[];
  onApproveBuild: () => void;
  onProposeSwitchUp: () => void;
  onAcceptSwitchUp: () => void;
  onDiscardSwitchUp: () => void;
  onRegenerate: () => void;
  onPreview: (mode: "faculty" | "student") => void;
  onPublish: () => void;
  onPublishSelected?: (itemIds: string[]) => void;
  onRelease: () => void;
  sectionOptions?: Array<{ id: string; title: string }>;
  publishSectionIds?: string[];
  onPublishSectionIdsChange?: (ids: string[]) => void;
  onRestoreRevision: (revisionId: string) => void;
  onCloseMobile?: () => void;
  onClosePanel?: () => void;
  showClose?: boolean;
  highlightItemId?: string | null;
  onSaveItemTitle?: (itemId: string, title: string) => void;
  onSaveItemBody?: (
    itemId: string,
    body: OutlineItemSummary["body"],
    opts?: { silent?: boolean },
  ) => void | Promise<void>;
  onAskAboutItem?: (itemId: string) => void;
  buildProgress?: string | null;
}) {
  const moduleCount = outline?.modules.length ?? 0;
  const activeModule = outline?.modules[modulePage] ?? null;
  const hasDiff = Boolean(switchDiffs && switchDiffs.length > 0);
  const stats = outline ? outlineAssignmentStats(outline.modules) : null;
  const selectedPlace = outline && selectedItem
    ? assignmentPlace(outline, selectedItem.id)
    : null;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(selectedItem?.title ?? "");

  useEffect(() => {
    setTitleDraft(selectedItem?.title ?? "");
    setEditingTitle(false);
  }, [selectedItem?.id, selectedItem?.title]);

  const headerTitle = !outline
    ? "No artifact yet"
    : artifactTab === "diff"
      ? "Switch up"
      : artifactTab === "assignment" && selectedItem
        ? selectedItem.title
        : outline.title;

  const headerSubtitle = !outline
    ? "Propose an outline in chat to open it here"
    : artifactTab === "diff"
      ? "Compare original vs new variants"
      : artifactTab === "assignment" && selectedItem
        ? itemPublished(selectedItem)
          ? "Published inactive — release when students should see it"
          : itemBodyIsStub(selectedItem)
            ? selectedPlace
              ? `Not built yet · ${selectedPlace.indexInModule + 1} of ${selectedPlace.moduleItemCount} in this module · ${selectedPlace.courseIndex + 1} of ${selectedPlace.courseCount} in the course`
              : "Not built yet — approve to write this assignment"
            : "Draft — preview, refine, then publish inactive"
        : stats
          ? stats.uniform
            ? `${moduleCount} modules · ${stats.each} assignments in each · ${stats.total} total`
            : `${moduleCount} modules · ${stats.total} assignments`
          : `${outline.modules.length} modules`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex shrink-0 flex-col gap-3 border-b border-rule/70 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {outline ? (
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2 py-0.5 text-[11px]",
                    statusTone(outline.status),
                  )}
                >
                  {outline.status}
                </span>
              ) : null}
              {artifactTab === "assignment" && selectedItem ? (
                <Badge variant="outline">{typeLabel(selectedItem.type)}</Badge>
              ) : null}
              {artifactTab === "assignment" && selectedItem ? (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px]",
                    statusTone(selectedItem.status),
                  )}
                >
                  {selectedItem.status}
                </span>
              ) : null}
            </div>
            {artifactTab === "assignment" &&
            selectedItem &&
            onSaveItemTitle &&
            editingTitle ? (
              <form
                className="mt-1 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onSaveItemTitle(selectedItem.id, titleDraft);
                  setEditingTitle(false);
                }}
              >
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  disabled={busy}
                />
                <Button type="submit" size="sm" disabled={busy}>
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTitleDraft(selectedItem.title);
                    setEditingTitle(false);
                  }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <h2
                className={cn(
                  "mt-1 truncate text-sm font-medium text-foreground",
                  artifactTab === "assignment" &&
                    selectedItem &&
                    onSaveItemTitle &&
                    "cursor-text rounded-md hover:bg-surface-sunken/60",
                )}
                title={
                  artifactTab === "assignment" && onSaveItemTitle
                    ? "Click to edit title"
                    : undefined
                }
                onClick={() => {
                  if (artifactTab === "assignment" && selectedItem && onSaveItemTitle) {
                    setEditingTitle(true);
                  }
                }}
              >
                {headerTitle}
              </h2>
            )}
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {buildProgress || headerSubtitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {showClose ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0"
                onClick={() => {
                  onCloseMobile?.();
                  onClosePanel?.();
                }}
                aria-label="Close artifact"
              >
                <X />
              </Button>
            ) : onClosePanel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden h-8 w-8 px-0 lg:inline-flex"
                onClick={onClosePanel}
                aria-label="Close artifact"
              >
                <X />
              </Button>
            ) : null}
          </div>
        </div>

        {outline ? (
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: "outline" as const, label: "Outline" },
                { id: "assignment" as const, label: "Assignment" },
                ...(hasDiff
                  ? [{ id: "diff" as const, label: "Diff" }]
                  : []),
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onArtifactTabChange(tab.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  artifactTab === tab.id
                    ? "border-foreground/30 bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        {outline ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {needsApproval ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={onApproveBuild}
              >
                {approving ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Building…
                  </>
                ) : (
                  <>
                    <Sparkles />
                    Approve & build
                  </>
                )}
              </Button>
            ) : artifactTab === "assignment" &&
              selectedItem &&
              !itemPublished(selectedItem) ? (
              <Button
                type="button"
                size="sm"
                disabled={
                  busy ||
                  (sectionOptions.length > 0 && publishSectionIds.length === 0)
                }
                onClick={onPublish}
              >
                Publish
              </Button>
            ) : artifactTab === "assignment" &&
              selectedItem &&
              itemPublished(selectedItem) ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={onRelease}
              >
                Release
              </Button>
            ) : artifactTab === "diff" && hasDiff ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={onAcceptSwitchUp}
              >
                Accept variants
              </Button>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {outline.bodiesBuilt ? (
                  <DropdownMenuItem onClick={onProposeSwitchUp}>
                    Switch up
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={onRegenerate}>
                  {generating ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  Re-propose outline
                </DropdownMenuItem>
                {artifactTab === "assignment" && selectedItem ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onPreview("faculty")}>
                      Instructor key
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onPreview("student")}>
                      As student
                    </DropdownMenuItem>
                    {onAskAboutItem ? (
                      <DropdownMenuItem
                        onClick={() => onAskAboutItem(selectedItem.id)}
                      >
                        Ask SOL about this item
                      </DropdownMenuItem>
                    ) : null}
                    {onSaveItemTitle ? (
                      <DropdownMenuItem onClick={() => setEditingTitle(true)}>
                        Edit title
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
                {artifactTab === "diff" && hasDiff ? (
                  <DropdownMenuItem onClick={onDiscardSwitchUp}>
                    Discard variants
                  </DropdownMenuItem>
                ) : null}
                {revisions.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    {revisions.slice(0, 8).map((r) => (
                      <DropdownMenuItem
                        key={r.id}
                        onClick={() => onRestoreRevision(r.id)}
                      >
                        Restore · {r.label}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      {sectionOptions.length > 0 &&
      ((artifactTab === "assignment" &&
        selectedItem &&
        !itemPublished(selectedItem)) ||
        artifactTab === "outline") ? (
        <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-2.5">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <p className="shrink-0 text-xs font-medium text-muted-foreground">
              Publish into
            </p>
            <div className="min-w-0 flex-1">
              <SectionMultiSelect
                options={sectionOptions}
                value={publishSectionIds}
                onChange={onPublishSectionIdsChange}
                placeholder="Select sections…"
              />
            </div>
          </div>
          {publishSectionIds.length === 0 ? (
            <p className="mt-1.5 text-[10px] text-destructive">
              Select at least one section before publishing.
            </p>
          ) : (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Published drafts stay inactive until you release them to students.
            </p>
          )}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!outline ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-border px-5 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              Artifact stage
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              When you propose an outline, it opens here. Click an item to review
              the assignment artifact.
            </p>
          </div>
        ) : artifactTab === "diff" && hasDiff ? (
          <div className="space-y-4">
            {switchDiffs!.map((d) => (
              <div
                key={d.itemId}
                className="grid gap-3 rounded-xl border border-border p-3 lg:grid-cols-2"
              >
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Original · sim {d.similarity.toFixed(2)}
                  </p>
                  <p className="mb-2 text-sm font-medium">{d.title}</p>
                  <OutlineItemBodyView type={d.type} body={d.before} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Switch up
                  </p>
                  <p className="mb-2 text-sm font-medium">{d.title}</p>
                  <OutlineItemBodyView type={d.type} body={d.after} />
                </div>
              </div>
            ))}
          </div>
        ) : artifactTab === "outline" ? (
          <OutlineBrowser
            outline={outline}
            activeModule={activeModule}
            modulePage={modulePage}
            moduleCount={moduleCount}
            onModulePageChange={onModulePageChange}
            typeFilter={typeFilter}
            onTypeFilterChange={onTypeFilterChange}
            visibleItems={visibleItems}
            selectedItemId={selectedItemId}
            onSelectItem={onSelectItem}
            highlightItemId={highlightItemId}
            busy={busy}
            onPublishSelected={onPublishSelected}
            sectionOptions={sectionOptions}
            publishSectionIds={publishSectionIds}
          />
        ) : selectedItem ? (
          <div
            className={cn(
              "rounded-xl transition-shadow duration-500",
              highlightItemId === selectedItem.id &&
                "ring-2 ring-brand/50 ring-offset-2 ring-offset-surface",
            )}
          >
            {preview ? (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
                <p className="text-xs font-medium text-foreground">
                  {preview.mode === "student"
                    ? "Student preview"
                    : "Instructor key"}{" "}
                  · {typeLabel(preview.type)}: {preview.title}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={onClearPreview}
                >
                  Close
                </Button>
              </div>
            ) : null}
            {preview ? (
              <OutlineItemBodyView type={preview.type} body={preview.body} />
            ) : itemBodyIsStub(selectedItem) ? (
              <AssignmentStructureCard
                item={selectedItem}
                place={selectedPlace}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {selectedItem.type === "QUIZ" &&
                onSaveItemBody &&
                !itemPublished(selectedItem) ? (
                  <QuizSettingsEditor
                    body={selectedItem.body ?? {}}
                    disabled={busy}
                    onSave={async (settings: QuizSettingsValues) => {
                      await onSaveItemBody(selectedItem.id, {
                        ...(selectedItem.body ?? {}),
                        ...settings,
                      });
                    }}
                  />
                ) : null}
                <OutlineItemBodyView
                  type={selectedItem.type}
                  body={selectedItem.body ?? {}}
                  editable={
                    selectedItem.type === "QUIZ" &&
                    Boolean(onSaveItemBody) &&
                    !itemPublished(selectedItem)
                  }
                  onQuestionPointsChange={
                    selectedItem.type === "QUIZ" && onSaveItemBody
                      ? (index, points) => {
                          const questions = [
                            ...(selectedItem.body?.questions ?? []),
                          ];
                          if (!questions[index]) return;
                          questions[index] = { ...questions[index], points };
                          void onSaveItemBody(
                            selectedItem.id,
                            {
                              ...(selectedItem.body ?? {}),
                              questions,
                            },
                            { silent: true },
                          );
                        }
                      : undefined
                  }
                />
              </div>
            )}
            {selectedItem.type === "LESSON" && !preview ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Lessons publish with flashcards; students see them after
                Release.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
            Select an item from the Outline tab.
          </div>
        )}
      </div>
    </div>
  );
}

function OutlineBrowser({
  outline,
  activeModule,
  modulePage,
  moduleCount,
  onModulePageChange,
  typeFilter,
  onTypeFilterChange,
  visibleItems,
  selectedItemId,
  onSelectItem,
  highlightItemId = null,
  busy,
  onPublishSelected = () => {},
  sectionOptions = [],
  publishSectionIds = [],
}: {
  outline: OutlineDetail;
  activeModule: OutlineDetail["modules"][number] | null;
  modulePage: number;
  moduleCount: number;
  onModulePageChange: (page: number) => void;
  typeFilter: "ALL" | OutlineItemSummary["type"];
  onTypeFilterChange: (filter: "ALL" | OutlineItemSummary["type"]) => void;
  visibleItems: OutlineItemSummary[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  highlightItemId?: string | null;
  busy: boolean;
  onPublishSelected?: (itemIds: string[]) => void;
  sectionOptions?: Array<{ id: string; title: string }>;
  publishSectionIds?: string[];
}) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCheckedIds((prev) => {
      const visible = new Set(visibleItems.map((i) => i.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [visibleItems]);

  if (!activeModule) {
    return (
      <p className="text-sm text-muted-foreground">No modules in this outline.</p>
    );
  }

  const publishableVisible = visibleItems.filter(itemPublishable);
  const checkedPublishable = publishableVisible.filter((i) =>
    checkedIds.has(i.id),
  );
  const allPublishableChecked =
    publishableVisible.length > 0 &&
    publishableVisible.every((i) => checkedIds.has(i.id));

  function toggleChecked(itemId: string, next?: boolean) {
    setCheckedIds((prev) => {
      const copy = new Set(prev);
      const shouldCheck = next ?? !copy.has(itemId);
      if (shouldCheck) copy.add(itemId);
      else copy.delete(itemId);
      return copy;
    });
  }

  function selectAllPublishable() {
    setCheckedIds(new Set(publishableVisible.map((i) => i.id)));
  }

  function clearChecked() {
    setCheckedIds(new Set());
  }

  return (
    <div className="flex flex-col gap-3 pb-16">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 shrink-0 px-0"
          disabled={modulePage <= 0}
          onClick={() => onModulePageChange(modulePage - 1)}
          aria-label="Previous module"
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {modulePage + 1} / {moduleCount}
          </p>
          <p className="truncate text-xs font-medium text-foreground">
            {activeModule.title}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 shrink-0 px-0"
          disabled={modulePage >= moduleCount - 1}
          onClick={() => onModulePageChange(modulePage + 1)}
          aria-label="Next module"
        >
          <ChevronRight />
        </Button>
      </div>

      {moduleCount > 1 ? (
        <div className="flex flex-wrap justify-center gap-1">
          {outline.modules.map((mod, i) => (
            <button
              key={mod.id}
              type="button"
              title={mod.title}
              aria-label={`Go to module ${i + 1}: ${mod.title}`}
              aria-current={i === modulePage ? "true" : undefined}
              onClick={() => onModulePageChange(i)}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i === modulePage
                  ? "bg-foreground"
                  : "bg-border hover:bg-muted-foreground/40",
              )}
            />
          ))}
        </div>
      ) : null}

      {activeModule.summary ? (
        <p className="line-clamp-2 text-[11px] text-muted-foreground">
          {activeModule.summary}
        </p>
      ) : null}

      <AssignmentCountSummary
        outline={outline}
        moduleItemCount={activeModule.items.length}
      />

      <div className="flex flex-wrap gap-1">
        {(
          ["ALL", "LESSON", "QUIZ", "DISCUSSION", "INTERACTIVE"] as const
        ).map((t) => {
          const count =
            t === "ALL"
              ? activeModule.items.length
              : activeModule.items.filter((i) => i.type === t).length;
          if (t !== "ALL" && count === 0) return null;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTypeFilterChange(t)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                typeFilter === t
                  ? "border-foreground/30 bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {t === "ALL" ? "This module" : typeLabel(t)} · {count}
            </button>
          );
        })}
      </div>

      {publishableVisible.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            className="text-foreground underline-offset-2 hover:underline"
            onClick={() =>
              allPublishableChecked ? clearChecked() : selectAllPublishable()
            }
          >
            {allPublishableChecked
              ? "Clear selection"
              : `Select ${publishableVisible.length} ready`}
          </button>
          {checkedPublishable.length > 0 ? (
            <span className="text-muted-foreground">
              {checkedPublishable.length} selected
            </span>
          ) : null}
        </div>
      ) : null}

      <ul className="space-y-1">
        {visibleItems.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
            No items in this filter.
          </li>
        ) : (
          visibleItems.map((item) => {
            const selected = selectedItemId === item.id;
            const highlighted = highlightItemId === item.id;
            const publishable = itemPublishable(item);
            const checked = checkedIds.has(item.id);
            return (
              <li key={item.id}>
                <div
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors duration-500",
                    selected
                      ? "border-foreground/25 bg-muted/60"
                      : "border-transparent bg-background/40 hover:border-border hover:bg-muted/40",
                    highlighted && "ring-2 ring-brand/50",
                  )}
                >
                  {publishable ? (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        toggleChecked(item.id, v === true)
                      }
                      aria-label={`Select ${item.title} for publish`}
                      className="shrink-0"
                    />
                  ) : (
                    <span
                      className="inline-block size-4 shrink-0"
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Badge
                      variant="outline"
                      className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                    >
                      {typeLabel(item.type)}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {itemMeta(item)}
                    </span>
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {checkedPublishable.length > 0 ? (
        <div className="sticky bottom-0 z-10 -mx-1 border-t border-border bg-surface/95 px-1 py-2 backdrop-blur">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={
                busy ||
                (sectionOptions.length > 0 && publishSectionIds.length === 0)
              }
              onClick={() =>
                onPublishSelected(checkedPublishable.map((i) => i.id))
              }
            >
              {busy ? (
                <>
                  <Loader2 className="animate-spin" />
                  Publishing…
                </>
              ) : (
                `Publish ${checkedPublishable.length} selected`
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={clearChecked}
            >
              Clear
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {sectionOptions.length > 0
              ? `Publishes inactive drafts into ${publishSectionIds.length || "no"} selected section${publishSectionIds.length === 1 ? "" : "s"}. Release later for students.`
              : "Publishes inactive drafts to your course. Release later for students."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AssignmentCountSummary({
  outline,
  moduleItemCount,
}: {
  outline: OutlineDetail;
  moduleItemCount: number;
}) {
  const stats = outlineAssignmentStats(outline.modules);
  const parts = [
    stats.byType.QUIZ > 0 ? `${stats.byType.QUIZ} quizzes` : null,
    stats.byType.DISCUSSION > 0
      ? `${stats.byType.DISCUSSION} discussions`
      : null,
    stats.byType.INTERACTIVE > 0
      ? `${stats.byType.INTERACTIVE} interactives`
      : null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-border bg-background/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <p className="text-foreground">
        {moduleItemCount} assignment{moduleItemCount === 1 ? "" : "s"} in this
        module
      </p>
      <p className="mt-0.5">
        {stats.uniform && stats.each > 0
          ? `Each of the ${outline.modules.length} modules has ${stats.each} assignments · ${stats.total} in the course`
          : `${stats.total} assignments in the course`}
        {parts.length > 0 ? ` (${parts.join(", ")})` : ""}
      </p>
    </div>
  );
}

type AssignmentPlace = {
  moduleTitle: string;
  indexInModule: number;
  moduleItemCount: number;
  courseIndex: number;
  courseCount: number;
};

function assignmentPlace(
  outline: OutlineDetail,
  itemId: string,
): AssignmentPlace | null {
  let courseIndex = 0;
  for (const mod of outline.modules) {
    const indexInModule = mod.items.findIndex((item) => item.id === itemId);
    if (indexInModule >= 0) {
      const courseCount = outline.modules.reduce(
        (sum, module) => sum + module.items.length,
        0,
      );
      return {
        moduleTitle: mod.title,
        indexInModule,
        moduleItemCount: mod.items.length,
        courseIndex: courseIndex + indexInModule,
        courseCount,
      };
    }
    courseIndex += mod.items.length;
  }
  return null;
}

function plannedAssignmentCopy(item: OutlineItemSummary) {
  if (item.type === "QUIZ") {
    return "Approve & build writes a 5–8 question quiz here, including a short answer.";
  }
  if (item.type === "DISCUSSION") {
    return "Approve & build writes the student instructions and tutor prompt for this discussion.";
  }
  if (item.type === "INTERACTIVE") {
    const kind = item.body?.interactiveKind
      ?.replaceAll("_", " ")
      .toLowerCase();
    return kind
      ? `Approve & build writes this ${kind} practice activity.`
      : "Approve & build writes the practice activity for this slot.";
  }
  if (item.type === "LESSON") {
    return "Interactive chapters need reading + practice checks. Use chat (“add interactive lessons”) or Approve & build to write the body.";
  }
  return "Approve & build writes this assignment.";
}

function AssignmentStructureCard({
  item,
  place,
}: {
  item: OutlineItemSummary;
  place: AssignmentPlace | null;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Not built yet
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{item.title}</p>
      {place ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Assignment {place.indexInModule + 1} of {place.moduleItemCount} in{" "}
          {place.moduleTitle}. {place.courseIndex + 1} of {place.courseCount}{" "}
          in the course.
        </p>
      ) : null}
      <p className="mt-3 text-sm text-foreground/90">
        {plannedAssignmentCopy(item)}
      </p>
    </div>
  );
}

function itemMeta(item: OutlineItemSummary) {
  if (itemPublished(item)) return "Published";
  if (itemBodyIsStub(item)) return "Not built";
  if (item.type === "QUIZ") {
    const count = item.body?.questions?.length ?? 0;
    return count > 0 ? `${count} questions` : "";
  }
  if (item.type === "DISCUSSION") return "Prompt ready";
  if (item.type === "INTERACTIVE") {
    return item.body?.interactiveKind?.replaceAll("_", " ") ?? "Ready";
  }
  return "Ready";
}
