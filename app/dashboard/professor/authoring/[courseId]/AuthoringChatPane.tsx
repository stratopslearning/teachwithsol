'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  Focus,
  History,
  List,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  X,
} from '@/components/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

import {
  ThinkingState,
  type ThinkingRow,
} from '@/components/authoring/ThinkingState';
import { SolMark } from '@/components/brand/SolMark';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useAuthoringShortcuts } from '@/hooks/useAuthoringShortcuts';
import { formatShortcutKeys, isMacPlatform } from '@/lib/shortcuts/registry';
import { cn } from '@/lib/utils';

import type {
  AttachableDoc,
  CourseCorpusItem,
} from './AuthoringMaterialsPanel';
import {
  AuthoringPlusMenu,
  splitMaterialTitle,
} from './AuthoringPlusMenu';
import { stripLastActionMarker } from '@/lib/authoring/agent/lastAction';

import type {
  AuthoringChatMessage,
  AuthoringProgress,
  AuthoringSessionListItem,
  AuthoringSuggestedAction,
  RolloverCheck,
} from './types';

/** Composer grows with its text up to this height, then scrolls. */
const COMPOSER_MAX_HEIGHT = 220;

export function AuthoringChatPane({
  courseId,
  courseTitle,
  materialsHref,
  materialsReady,
  materialsTotal,
  attachableDocuments,
  corpusItems,
  focusedMaterialIds,
  onFocusedMaterialIdsChange,
  onMaterialsChanged,
  messages,
  chatInput,
  onChatInputChange,
  onSubmit,
  onAction,
  onRetryMessage,
  onOpenArtifact,
  onToggleArtifact,
  onOpenOutline,
  onCloseArtifact,
  onStop,
  sessions = [],
  activeSessionId = null,
  onOpenSession,
  onStartNewChat,
  historyBusy = false,
  busy,
  chatting,
  thinking,
  generating,
  approving,
  canPropose,
  hasOutline,
  needsApproval,
  bodiesBuilt,
  focusLabel,
  showMobileArtifactButton,
  artifactOpen = false,
  toolStatus,
  progress = null,
  publishChecks = [],
}: {
  courseId: string;
  courseTitle: string;
  materialsHref: string;
  materialsReady: number;
  materialsTotal: number;
  attachableDocuments: AttachableDoc[];
  corpusItems: CourseCorpusItem[];
  focusedMaterialIds: string[];
  onFocusedMaterialIdsChange: (ids: string[]) => void;
  onMaterialsChanged: (opts?: { attachedDocId?: string }) => void;
  messages: AuthoringChatMessage[];
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onAction: (action: AuthoringSuggestedAction) => void;
  /** Claude-style in-place retry from a user (or assistant) turn. */
  onRetryMessage?: (messageId: string) => void;
  onOpenArtifact: () => void;
  onToggleArtifact?: () => void;
  onOpenOutline?: () => void;
  onCloseArtifact?: () => void;
  onStop?: () => void;
  sessions?: AuthoringSessionListItem[];
  activeSessionId?: string | null;
  onOpenSession?: (sessionId: string) => void;
  onStartNewChat?: () => void;
  historyBusy?: boolean;
  busy: boolean;
  chatting: boolean;
  thinking: boolean;
  generating: boolean;
  approving: boolean;
  canPropose: boolean;
  hasOutline: boolean;
  needsApproval: boolean;
  bodiesBuilt: boolean;
  focusLabel: string | null;
  showMobileArtifactButton: boolean;
  artifactOpen?: boolean;
  toolStatus?: string | null;
  /** Structured agent progress — drives the expandable thinking trace. */
  progress?: AuthoringProgress | null;
  /** "Before you publish" warnings, shown as a compact pill in the toolbar. */
  publishChecks?: RolloverCheck[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);

  // Grow the composer with its text (up to a cap) without re-laying out.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [chatInput]);
  const [uploadOpenSignal, setUploadOpenSignal] = useState(0);
  const isWelcome = messages.length === 0 && !hasOutline;
  const streaming = chatting || generating || approving;
  const modHint = formatShortcutKeys('⌘.', isMacPlatform());
  const historyHint = formatShortcutKeys('⌘⇧H', isMacPlatform());

  // Welcome / pre-outline: always allow send so empty focus or zero materials
  // doesn't trap the composer — the client guides in-chat if materials are missing.
  const canSend =
    !busy &&
    Boolean(chatInput.trim()) &&
    ((!hasOutline) ||
      needsApproval ||
      (hasOutline && bodiesBuilt));

  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === 'user' && m.content.trim()) return m.content;
    }
    return null;
  }, [messages]);

  useAuthoringShortcuts({
    composerRef,
    chatInput,
    setChatInput: onChatInputChange,
    lastUserMessage,
    streaming,
    canSend,
    artifactOpen,
    onStop: () => onStop?.(),
    onSend: () => {
      formRef.current?.requestSubmit();
    },
    onToggleArtifact: () => {
      if (onToggleArtifact) onToggleArtifact();
      else if (artifactOpen) onCloseArtifact?.();
      else onOpenArtifact();
    },
    onOpenOutline: () => {
      if (onOpenOutline) onOpenOutline();
      else onOpenArtifact();
    },
    onCloseArtifact: () => onCloseArtifact?.(),
    onNewChat: () => onStartNewChat?.(),
    onOpenHistory: () => setHistoryOpen(true),
    onOpenUpload: () => setUploadOpenSignal((n) => n + 1),
  });

  useEffect(() => {
    if (!pinnedToBottom) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking, streaming, pinnedToBottom, toolStatus]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinnedToBottom(dist < 80);
  }

  const placeholder = streaming
    ? 'Working…'
    : isWelcome
      ? 'How should we build this course?'
      : needsApproval
        ? 'Reply'
        : focusLabel
          ? `Rewrite ${focusLabel}…`
          : 'Reply';

  const starters: AuthoringSuggestedAction[] = [
    {
      id: 'propose',
      label: 'Propose outline from materials',
      action: 'propose',
    },
    {
      id: 'open-materials-hint',
      label: 'Turn syllabus into a quiz',
      action: 'propose',
    },
  ];

  // Prefer concrete parent-driven progress (title + n/N) for every action.
  const statusLine =
    progress?.label ||
    toolStatus ||
    (approving
      ? 'Building assignments…'
      : generating
        ? 'Drafting outline…'
        : chatting
          ? 'Working on your request…'
          : thinking
            ? 'Thinking…'
            : null);

  const thinkingRows: ThinkingRow[] =
    progress?.steps?.length
      ? progress.steps.map((step) => ({ primary: step }))
      : statusLine
        ? [{ primary: statusLine.replace(/…$/, '') }]
        : [{ primary: 'Working on your request' }];

  const thinkingStepIndex = progress?.steps?.length
    ? progress.index
    : 0;


  const plusMenu = (
    <AuthoringPlusMenu
      courseId={courseId}
      materialsHref={materialsHref}
      attachableDocuments={attachableDocuments}
      corpusItems={corpusItems}
      focusedMaterialIds={focusedMaterialIds}
      onFocusedMaterialIdsChange={onFocusedMaterialIdsChange}
      disabled={busy}
      onUploaded={() => onMaterialsChanged()}
      onAttached={(docId) => onMaterialsChanged({ attachedDocId: docId })}
      openUploadSignal={uploadOpenSignal}
    />
  );

  const chatsToolbar = (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-rule/60 px-4 py-2.5">
      <p className="min-w-0 truncate text-xs text-ink-muted">
        <span className="font-medium text-ink">{courseTitle}</span>
        {' · '}
        <span className="font-medium text-ink">{materialsReady}</span>/
        {materialsTotal} materials ready
        {focusedMaterialIds.length > 0
          ? ` · focusing ${focusedMaterialIds.length}`
          : ''}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        {publishChecks.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-amber-500/40 text-ink"
                aria-label={`${publishChecks.length} things to fix before publishing`}
              >
                <AlertTriangle className="size-3.5 text-amber-500" aria-hidden />
                <span className="tabular-nums">{publishChecks.length}</span>
                <span className="hidden sm:inline">to fix</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
              <div className="border-b border-rule/60 px-3.5 py-2.5">
                <p className="text-[13px] font-medium text-ink">Before you publish</p>
                <p className="text-[11.5px] text-ink-faint">
                  {publishChecks.length} check{publishChecks.length === 1 ? '' : 's'} need attention
                </p>
              </div>
              <ul className="max-h-72 space-y-0.5 overflow-y-auto p-1.5">
                {publishChecks.map((c, i) => (
                  <li key={`${c.code}-${i}`} className="rounded-md px-2 py-1.5 text-[12.5px] leading-snug hover:bg-surface-sunken">
                    <span className="font-medium text-ink">{c.title}</span>
                    <span className="text-ink-muted"> — {c.detail}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-rule/60 p-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onAction({
                      id: 'fix-checks',
                      label: 'Help me fix these',
                      action: 'prompt',
                      prompt: 'Help me fix the "Before you publish" checks — what should I do for each?',
                    })
                  }
                  className="w-full rounded-md px-2 py-1.5 text-left text-[12.5px] font-medium text-brand hover:bg-surface-sunken disabled:opacity-50"
                >
                  Ask SOL to help fix these
                </button>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={historyOpen ? 'secondary' : 'outline'}
              size="sm"
              className="h-8"
              disabled={historyBusy}
              aria-label="Previous chats"
              title={`Previous chats (${historyHint})`}
            >
              {historyBusy ? (
                <Loader2 className="animate-spin" />
              ) : (
                <History />
              )}
              Chats
              {sessions.length > 0 ? ` · ${sessions.length}` : ''}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(22rem,calc(100vw-2rem))] p-0"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <p className="text-xs font-medium text-foreground">
                Previous chats
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                disabled={
                  busy ||
                  historyBusy ||
                  (!hasOutline && messages.length === 0) ||
                  !onStartNewChat
                }
                onClick={() => {
                  setHistoryOpen(false);
                  onStartNewChat?.();
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            </div>
            {sessions.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                No saved authoring chats yet. Propose an outline to start one.
              </p>
            ) : (
              <ul className="max-h-72 overflow-y-auto py-1">
                {sessions.map((session) => {
                  const active = session.id === activeSessionId;
                  const archived = session.status === 'ARCHIVED';
                  return (
                    <li key={session.id}>
                      <button
                        type="button"
                        disabled={busy || active || !onOpenSession}
                        onClick={() => {
                          setHistoryOpen(false);
                          onOpenSession?.(session.id);
                        }}
                        className={cn(
                          'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors',
                          active
                            ? 'bg-muted/70'
                            : 'hover:bg-muted/50 disabled:opacity-50',
                        )}
                      >
                        <span className="flex w-full items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                            {session.title || 'Untitled outline'}
                          </span>
                          {active ? (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                              Current
                            </span>
                          ) : archived ? (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                              Past
                            </span>
                          ) : null}
                        </span>
                        <span className="line-clamp-2 w-full text-[11px] text-muted-foreground">
                          {session.preview ||
                            session.brief ||
                            'No messages yet'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </PopoverContent>
        </Popover>
        {showMobileArtifactButton ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onOpenArtifact}
            aria-label="Open outline artifact"
            title={`Open outline (${modHint})`}
          >
            <List />
            Outline
          </Button>
        ) : null}
      </div>
    </div>
  );

  const focusChips =
    focusedMaterialIds.length > 0 ? (
      <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
        <span className="mr-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          <Focus className="h-3 w-3" aria-hidden />
          Focus
        </span>
        {focusedMaterialIds.map((id) => {
          const item = corpusItems.find((c) => c.id === id);
          if (!item) return null;
          const { folder, name } = splitMaterialTitle(item.title);
          return (
            <span
              key={id}
              className="authoring-pop-in inline-flex max-w-[12rem] items-center gap-1 rounded-full bg-surface-sunken py-0.5 pl-2.5 pr-1 text-[11.5px] text-ink-muted shadow-[0_0_0_1px_var(--rule)]"
            >
              <span className="min-w-0 truncate">
                {folder ? (
                  <>
                    <span className="text-ink-faint">{folder}</span>
                    <span className="text-ink-faint"> / </span>
                  </>
                ) : null}
                {name}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onFocusedMaterialIdsChange(
                    focusedMaterialIds.filter((x) => x !== id),
                  )
                }
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
                aria-label={`Remove ${item.title} from focus`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <button
          type="button"
          disabled={busy}
          onClick={() => onFocusedMaterialIdsChange([])}
          className="ml-0.5 text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    ) : null;

  const composer = (
    <div
      className={cn(
        'w-full',
        isWelcome ? 'mx-auto max-w-[34rem]' : 'mx-auto max-w-[40rem]',
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) {
          toast.message('Use + to upload files', {
            description: 'Open Upload or add files from the composer.',
          });
        }
      }}
    >
      {focusChips}

      {/* Welcome keeps status on the composer; chat view uses the in-thread indicator only. */}
      {statusLine && isWelcome ? (
        <div
          className="mb-2 flex items-center justify-center gap-2 px-2 text-[11px] text-ink-muted"
          aria-live="polite"
        >
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          <span key={statusLine} className="min-w-0 truncate animate-fade-in">
            {statusLine}
          </span>
          {materialsReady > 0 ? (
            <span className="shrink-0 text-ink-faint">
              {materialsReady}/{materialsTotal} ready
            </span>
          ) : null}
        </div>
      ) : null}

      <form
        ref={formRef}
        onSubmit={onSubmit}
        className={cn(
          'relative isolate overflow-hidden rounded-[20px] border bg-surface shadow-[var(--shadow-paper)] transition-[border-color,box-shadow,background-color] duration-150',
          dragOver
            ? 'border-brand/45 bg-brand-soft/40'
            : composerFocused
              ? 'border-rule-strong shadow-[var(--shadow-paper-lg)]'
              : 'border-rule/80',
        )}
      >
        <div className="flex flex-col gap-1.5 p-2.5">
          <Textarea
            ref={composerRef}
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            placeholder={placeholder}
            rows={1}
            disabled={busy && !streaming}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            className={cn(
              // Fixed shape; height follows the text (see autosize effect) so
              // typing never re-lays out the composer.
              'min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-1.5 text-[14px] leading-5 shadow-none placeholder:text-ink-faint focus-visible:ring-0',
              'transition-[height] duration-100 ease-out',
              isWelcome ? 'min-h-[4.5rem]' : 'min-h-[2.25rem]',
            )}
            style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSubmit(e as unknown as React.FormEvent);
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <div className="shrink-0">{plusMenu}</div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {isWelcome
                  ? starters.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        disabled={busy || !canPropose}
                        onClick={() => onAction(chip)}
                        className="rounded-full bg-surface-sunken/70 px-2.5 py-1 text-[11.5px] text-ink transition-colors hover:bg-surface-sunken disabled:opacity-50"
                      >
                        {chip.label}
                      </button>
                    ))
                  : (
                      <span
                        className={cn(
                          'truncate px-1 text-[11px] text-ink-faint transition-opacity duration-150',
                          composerFocused ? 'opacity-100' : 'opacity-0',
                        )}
                      >
                        Enter to send · Shift+Enter newline ·{' '}
                        {formatShortcutKeys('⌘/', isMacPlatform())} shortcuts
                      </span>
                    )}
              </div>
            </div>
            <ComposerSend
              canSend={canSend}
              streaming={streaming}
              onStop={onStop}
              label={!hasOutline ? 'Propose' : 'Send'}
            />
          </div>
        </div>
      </form>

      <div className="mt-2 flex items-center justify-between gap-3 px-2 text-[11px] text-ink-faint">
        <span className="min-w-0 truncate">
          {isWelcome
            ? `${materialsReady}/${materialsTotal} materials ready`
            : 'SOL can make mistakes — review before publishing.'}
        </span>
        {!isWelcome ? (
          <span className="shrink-0 tabular-nums">
            {materialsReady}/{materialsTotal} ready
          </span>
        ) : null}
      </div>
    </div>
  );

  if (isWelcome) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col bg-paper">
        {chatsToolbar}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-10">
          <SolMark className="mb-4 h-10 w-10 text-brand" />
          <h2 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
            {greeting()}
          </h2>
          <p className="mt-2 max-w-md text-center text-sm text-ink-muted">
            {courseTitle}
            {' — describe what to build. Add Ready materials with + before proposing an outline.'}
          </p>
          <div className="mt-8 w-full">{composer}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-paper">
      {chatsToolbar}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-5 px-4 py-6">
          {messages.map((m) => (
            <ChatBubble
              key={m.id}
              message={m}
              busy={busy}
              onAction={onAction}
              onEdit={
                m.role === 'user'
                  ? () => {
                      onChatInputChange(m.content);
                      toast.message('Message loaded for edit', {
                        description: 'Change it in the composer, then send.',
                      });
                    }
                  : undefined
              }
              onRetry={
                onRetryMessage &&
                (m.role === 'user' || m.role === 'assistant')
                  ? () => onRetryMessage(m.id)
                  : undefined
              }
            />
          ))}
          {thinking || streaming ? (
            <div aria-live="polite" className="pl-0.5">
              <ThinkingState
                key={
                  approving
                    ? 'approve'
                    : generating
                      ? 'generate'
                      : chatting
                        ? 'chat'
                        : 'think'
                }
                variant="Steps"
                busy
                inline
                active={statusLine || 'Thinking…'}
                rows={thinkingRows}
                stepIndex={thinkingStepIndex}
              />
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      {!pinnedToBottom ? (
        <button
          type="button"
          onClick={() => {
            setPinnedToBottom(true);
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="absolute bottom-[7.5rem] left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-rule/80 bg-surface/95 px-3 py-1.5 text-xs font-medium text-ink shadow-[var(--shadow-paper)] backdrop-blur-md"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          Jump to latest
        </button>
      ) : null}

      <div className="pointer-events-none shrink-0 bg-gradient-to-t from-paper via-paper/95 to-transparent px-4 pb-3 pt-6">
        <div className="pointer-events-auto">{composer}</div>
      </div>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function relativeTime(iso?: string) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function ComposerSend({
  canSend,
  streaming,
  onStop,
  label,
  pill = false,
}: {
  canSend: boolean;
  streaming: boolean;
  onStop?: () => void;
  label: string;
  pill?: boolean;
}) {
  const radius = pill ? 'rounded-full' : 'rounded-lg';
  if (streaming && onStop) {
    return (
      <button
        type="button"
        onClick={onStop}
        aria-label="Stop"
        className={cn(
          'flex size-7 shrink-0 items-center justify-center bg-surface-sunken text-ink transition-[background-color,transform] duration-150 hover:bg-rule/70 active:scale-[0.94]',
          radius,
        )}
      >
        <Square className="h-3.5 w-3.5 fill-current" />
      </button>
    );
  }
  return (
    <button
      type="submit"
      disabled={!canSend}
      aria-label={label}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94]',
        radius,
      )}
      style={{
        background: canSend ? 'var(--ink)' : 'var(--rule-strong)',
        color: canSend ? 'var(--surface)' : 'var(--ink-muted)',
      }}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}

function MessageActions({
  align,
  when,
  onRetry,
  onEdit,
  onCopy,
}: {
  align: 'start' | 'end';
  when?: string | null;
  onRetry?: () => void;
  onEdit?: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      className={cn(
        'mt-1.5 flex items-center gap-0.5 opacity-55 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100',
        align === 'end' ? 'justify-end' : 'justify-start',
      )}
    >
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex size-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink-muted"
        aria-label="Copy"
      >
        <Copy className="h-[15px] w-[15px]" />
      </button>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex size-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink-muted"
          aria-label="Retry"
        >
          <RotateCcw className="h-[15px] w-[15px]" />
        </button>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex size-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink-muted"
          aria-label="Edit"
        >
          <Pencil className="h-[15px] w-[15px]" />
        </button>
      ) : null}
      {when ? (
        <span className="ml-1.5 text-[11px] text-ink-faint">{when}</span>
      ) : null}
    </div>
  );
}

function ChatBubble({
  message,
  busy,
  onAction,
  onRetry,
  onEdit,
}: {
  message: AuthoringChatMessage;
  busy: boolean;
  onAction: (action: AuthoringSuggestedAction) => void;
  onRetry?: () => void;
  onEdit?: () => void;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const when = relativeTime(message.createdAt);
  const followUps = message.suggestedActions ?? [];

  const displayContent = isUser
    ? message.content
    : stripLastActionMarker(message.content);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(displayContent);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  }

  return (
    <div
      className={cn(
        'group authoring-fade-up flex flex-col gap-2.5',
        isUser ? 'items-end' : 'items-start',
      )}
    >
      {isUser ? (
        <div className="flex max-w-[min(85%,28rem)] flex-col items-end pl-10">
          <div className="rounded-xl bg-surface-sunken px-3 py-1.5 text-[13px] leading-[1.4] text-ink">
            <p className="whitespace-pre-wrap">{displayContent}</p>
          </div>
          <MessageActions
            align="end"
            when={when}
            onRetry={busy ? undefined : onRetry}
            onEdit={busy ? undefined : onEdit}
            onCopy={() => void copyText()}
          />
        </div>
      ) : (
        <div className="w-full max-w-none">
          {!isSystem ? (
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] leading-none">
              <span className="font-medium text-ink">SOL</span>
              {when ? (
                <span className="text-ink-faint">· {when}</span>
              ) : null}
            </div>
          ) : null}
          {message.trace?.steps.length ? (
            <ThinkingState
              variant="Steps"
              busy={false}
              inline
              seconds={message.trace.seconds}
              rows={message.trace.steps.map((step) => ({ primary: step }))}
              className="mb-1"
            />
          ) : null}
          <div
            className={cn(
              'authoring-md prose max-w-none text-[14px] leading-[1.55] text-ink',
              'prose-p:my-2.5 prose-p:text-[14px] prose-p:leading-[1.55]',
              'prose-headings:mb-1.5 prose-headings:mt-3.5 prose-headings:font-semibold prose-headings:text-ink prose-headings:tracking-normal',
              'prose-h3:text-[13px] prose-h3:font-semibold prose-h3:uppercase prose-h3:tracking-[0.06em] prose-h3:text-ink-muted',
              'prose-h4:text-[13px] prose-h4:font-semibold prose-h4:text-ink-muted',
              'prose-ul:my-2.5 prose-ul:list-disc prose-ul:pl-5',
              'prose-ol:my-2.5 prose-ol:list-decimal prose-ol:pl-5',
              'prose-li:my-1.5 prose-li:text-[14px] prose-li:leading-[1.5] prose-li:marker:text-ink-faint',
              'prose-strong:font-semibold prose-strong:text-ink',
              'prose-a:text-brand prose-code:rounded prose-code:bg-surface-sunken prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-pre:bg-surface-sunken',
              'prose-hr:my-3 prose-hr:border-rule/70',
              isSystem && 'text-ink-muted',
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {displayContent}
            </ReactMarkdown>
          </div>
          {!isSystem ? (
            <MessageActions
              align="start"
              onRetry={busy ? undefined : onRetry}
              onCopy={() => void copyText()}
            />
          ) : null}
        </div>
      )}

      {message.artifactRef ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onAction({
              id: `ref-${message.id}`,
              label: message.artifactRef!.label,
              action:
                message.artifactRef!.kind === 'item'
                  ? 'open_item'
                  : message.artifactRef!.kind === 'switch_up'
                    ? 'switch_up'
                    : 'open_outline',
              itemId: message.artifactRef!.itemId,
            })
          }
          className="authoring-pop-in inline-flex max-w-[22rem] items-center gap-3 rounded-[10px] border border-rule/80 bg-surface px-3 py-2.5 text-left shadow-[var(--shadow-paper)] transition-colors hover:border-rule-strong hover:bg-surface-elevated disabled:opacity-50"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium text-ink-faint">
              {message.artifactRef.kind === 'outline'
                ? 'Outline'
                : message.artifactRef.kind === 'switch_up'
                  ? 'Switch-up'
                  : 'Assignment'}
            </span>
            <span className="mt-0.5 block truncate text-[13px] font-medium text-ink">
              {message.artifactRef.label}
            </span>
          </span>
          <span className="shrink-0 text-[12px] font-medium text-brand">
            Open
          </span>
        </button>
      ) : null}

      {followUps.length > 0 ? (
        <div className="w-full max-w-md">
          <p className="text-[12px] font-medium text-ink-muted">Follow-ups</p>
          <div className="mt-0.5 flex flex-col">
            {followUps.map((chip, i) => (
              <button
                key={chip.id}
                type="button"
                disabled={busy}
                onClick={() => onAction(chip)}
                className="-mx-1.5 flex items-center gap-2 rounded-md border-b border-rule/60 px-1.5 py-1.5 text-left text-[12.5px] text-ink transition-colors hover:bg-surface-sunken/70 disabled:opacity-50 last:border-b-0"
                style={{
                  animation: `authoring-fade-up 350ms cubic-bezier(0.23,1,0.32,1) ${i * 90}ms both`,
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--ink-faint)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                  aria-hidden
                >
                  <path d="M9 10l-5 5 5 5" />
                  <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                </svg>
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
