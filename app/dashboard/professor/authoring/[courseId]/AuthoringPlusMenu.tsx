'use client';

import { apiFetch } from '@/lib/api/client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Focus,
  Library,
  Loader2,
  Paperclip,
  Plus,
  Upload,
} from '@/components/icons';
import {
  MAX_UPLOAD_BYTES as MAX_BYTES,
  MAX_ZIP_UPLOAD_BYTES as MAX_ZIP_BYTES,
  MATERIAL_UPLOAD_ACCEPT as ACCEPTED,
} from '@/lib/uploadLimits';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import type { AttachableDoc, CourseCorpusItem } from './AuthoringMaterialsPanel';

function isZipFile(file: File) {
  const mime = (file.type || '').toLowerCase();
  return (
    /\.zip$/i.test(file.name) ||
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed'
  );
}

/** Zip imports use "folder / file" titles — split for grouped display. */
export function splitMaterialTitle(title: string): {
  folder: string | null;
  name: string;
} {
  const idx = title.indexOf(' / ');
  if (idx <= 0) return { folder: null, name: title };
  const folder = title.slice(0, idx).trim();
  const name = title.slice(idx + 3).trim();
  if (!folder || !name) return { folder: null, name: title };
  return { folder, name };
}

function groupCorpusItems(items: CourseCorpusItem[]) {
  const map = new Map<
    string,
    { folder: string | null; label: string; items: CourseCorpusItem[] }
  >();
  for (const item of items) {
    const { folder } = splitMaterialTitle(item.title);
    const key = folder ?? '';
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        folder,
        label: folder ?? 'Course materials',
        items: [item],
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.folder == null && b.folder != null) return 1;
    if (a.folder != null && b.folder == null) return -1;
    return a.label.localeCompare(b.label);
  });
}

type View = 'menu' | 'upload' | 'focus' | 'library';

export function AuthoringPlusMenu({
  courseId,
  materialsHref,
  attachableDocuments,
  corpusItems,
  focusedMaterialIds,
  onFocusedMaterialIdsChange,
  onAttached,
  onUploaded,
  disabled,
  openUploadSignal = 0,
}: {
  courseId: string;
  materialsHref: string;
  attachableDocuments: AttachableDoc[];
  corpusItems: CourseCorpusItem[];
  focusedMaterialIds: string[];
  onFocusedMaterialIdsChange: (ids: string[]) => void;
  onAttached: (docId: string) => void;
  onUploaded: () => void;
  disabled?: boolean;
  /** Increment to open the menu on the upload view (⌘U). */
  openUploadSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastUploadSignal = useRef(0);

  useEffect(() => {
    if (!openUploadSignal || openUploadSignal === lastUploadSignal.current) {
      return;
    }
    lastUploadSignal.current = openUploadSignal;
    if (disabled) return;
    setView('upload');
    setOpen(true);
  }, [disabled, openUploadSignal]);

  const readyCorpus = corpusItems.filter((c) => c.status === 'READY');
  const focusActive = focusedMaterialIds.length > 0;
  const busy = disabled || uploading || Boolean(attachingId);
  const focusGroups = useMemo(
    () => groupCorpusItems(corpusItems),
    [corpusItems],
  );
  const useFolderGroups =
    focusGroups.length > 1 ||
    (focusGroups.length === 1 && focusGroups[0]?.folder != null);

  function closeAndReset() {
    setOpen(false);
    setView('menu');
  }

  function toggleFocus(id: string, next: boolean) {
    if (next) {
      onFocusedMaterialIdsChange([...focusedMaterialIds, id]);
    } else {
      onFocusedMaterialIdsChange(focusedMaterialIds.filter((x) => x !== id));
    }
  }

  function setGroupFocus(groupItems: CourseCorpusItem[], select: boolean) {
    const readyIds = groupItems
      .filter((i) => i.status === 'READY')
      .map((i) => i.id);
    if (select) {
      const set = new Set(focusedMaterialIds);
      for (const id of readyIds) set.add(id);
      onFocusedMaterialIdsChange([...set]);
    } else {
      const drop = new Set(readyIds);
      onFocusedMaterialIdsChange(
        focusedMaterialIds.filter((id) => !drop.has(id)),
      );
    }
  }

  async function uploadFile(file: File) {
    const zip = isZipFile(file);
    if (zip && file.size > MAX_ZIP_BYTES) {
      toast.error('Zip must be 50 MB or smaller');
      return;
    }
    if (!zip && file.size > MAX_BYTES) {
      toast.error('File must be 50 MB or smaller');
      return;
    }
    const fd = new FormData();
    fd.set('courseId', courseId);
    fd.set('file', file);
    if (!zip) fd.set('title', file.name.replace(/\.[^.]+$/, ''));
    setUploading(true);
    try {
      const res = await apiFetch('/api/professor/materials', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
        redirect: 'manual',
      });
      if (
        res.type === 'opaqueredirect' ||
        (res.status >= 300 && res.status < 400)
      ) {
        toast.error('Session expired — refresh and sign in again');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          res.status === 401
            ? 'Session expired — refresh and sign in again'
            : res.status === 413
              ? zip
                ? 'Zip is too large (max 50 MB)'
                : 'File is too large (max 50 MB)'
              : data.error || 'Upload failed',
        );
        return;
      }
      if (data.zip) {
        const imported = Number(data.imported ?? 0);
        const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
        toast.success(
          skipped > 0
            ? `Imported ${imported} · ${skipped} skipped`
            : `Imported ${imported} from zip`,
          {
            description: 'Select materials above before proposing.',
          },
        );
      } else {
        toast.success('Upload queued for indexing', {
          description: 'Select materials above before proposing.',
        });
      }
      onUploaded();
      setView('menu');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function attachDoc(documentId: string) {
    setAttachingId(documentId);
    try {
      const res = await apiFetch('/api/professor/knowledge/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, documentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not attach document');
        return;
      }
      toast.success('Attached from library');
      onAttached(documentId);
    } catch {
      toast.error('Could not attach document');
    } finally {
      setAttachingId(null);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setView('menu');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-[background-color,color,transform] duration-150',
            'hover:bg-surface-sunken hover:text-ink active:scale-[0.94]',
            open && 'bg-surface-sunken text-ink',
            disabled && 'opacity-50',
          )}
          aria-label="Add files and materials"
          aria-expanded={open}
        >
          <Plus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        className={cn(
          'border-rule bg-surface p-0 text-ink shadow-md',
          view === 'menu'
            ? 'w-[min(18rem,calc(100vw-2rem))]'
            : 'w-[min(22rem,calc(100vw-2rem))]',
        )}
      >
        {view === 'menu' ? (
          <ul className="py-1.5">
            <MenuRow
              icon={<Paperclip className="h-4 w-4" />}
              label="Upload or add files"
              hint="⌘U"
              onClick={() => setView('upload')}
            />
            <MenuRow
              icon={<Focus className="h-4 w-4" />}
              label="Focus materials"
              hint={
                focusActive
                  ? `${focusedMaterialIds.length}`
                  : readyCorpus.length > 0
                    ? 'All'
                    : undefined
              }
              chevron
              onClick={() => setView('focus')}
            />
            <MenuRow
              icon={<Library className="h-4 w-4" />}
              label="Attach from library"
              chevron
              onClick={() => setView('library')}
            />
            <div className="my-1.5 border-t border-rule/70" />
            <li>
              <Link
                href={materialsHref}
                onClick={closeAndReset}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-sunken"
              >
                <Upload className="h-4 w-4 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">Manage all materials</span>
                <ChevronRight className="h-3.5 w-3.5 text-ink-faint" />
              </Link>
            </li>
          </ul>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center gap-1 border-b border-rule/70 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setView('menu')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-medium text-ink">
                {view === 'upload'
                  ? 'Upload files'
                  : view === 'focus'
                    ? 'Focus materials'
                    : 'Library'}
              </p>
            </div>

            <div className="max-h-[min(22rem,60vh)] overflow-y-auto p-3">
              {view === 'upload' ? (
                <div
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragging(false);
                    if (busy) return;
                    const file = e.dataTransfer.files?.[0];
                    if (file) void uploadFile(file);
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-5 text-center transition-colors',
                    dragging
                      ? 'border-brand/50 bg-brand-soft'
                      : 'border-rule bg-surface-sunken/40',
                    busy && 'opacity-60',
                  )}
                >
                  <Upload className="h-4 w-4 text-ink-muted" aria-hidden />
                  <div>
                    <p className="text-xs font-medium text-ink">
                      Drag & drop a file or zip
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      PDF, DOCX, TXT, MD · up to 50 MB · zip up to 50 MB
                    </p>
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED}
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadFile(file);
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    className="mt-1"
                    onClick={() => inputRef.current?.click()}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      'Choose file'
                    )}
                  </Button>
                </div>
              ) : null}

              {view === 'focus' ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] leading-snug text-ink-faint">
                      {focusActive
                        ? `${focusedMaterialIds.length} selected for propose / refine`
                        : 'Nothing selected — uses all Ready materials'}
                    </p>
                    {focusActive ? (
                      <button
                        type="button"
                        className="shrink-0 text-[11px] font-medium text-brand underline-offset-2 hover:underline"
                        onClick={() => onFocusedMaterialIdsChange([])}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  {corpusItems.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-rule px-3 py-4 text-xs text-ink-faint">
                      No course materials yet. Upload a file first.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {(useFolderGroups
                        ? focusGroups
                        : [
                            {
                              folder: null as string | null,
                              label: '',
                              items: corpusItems,
                            },
                          ]
                      ).map((group) => {
                        const readyInGroup = group.items.filter(
                          (i) => i.status === 'READY',
                        );
                        const selectedInGroup = readyInGroup.filter((i) =>
                          focusedMaterialIds.includes(i.id),
                        );
                        const allSelected =
                          readyInGroup.length > 0 &&
                          selectedInGroup.length === readyInGroup.length;
                        const someSelected =
                          selectedInGroup.length > 0 && !allSelected;
                        return (
                          <div key={group.folder ?? '__root'}>
                            {useFolderGroups ? (
                              <div className="mb-1 flex items-center justify-between gap-2 px-0.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                                  {group.label}
                                  <span className="ml-1.5 font-normal normal-case tracking-normal text-ink-faint/80">
                                    {group.items.length}
                                  </span>
                                </p>
                                {readyInGroup.length > 0 ? (
                                  <button
                                    type="button"
                                    className="text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                                    onClick={() =>
                                      setGroupFocus(
                                        group.items,
                                        !allSelected,
                                      )
                                    }
                                  >
                                    {allSelected
                                      ? 'Deselect'
                                      : someSelected
                                        ? 'Select rest'
                                        : 'Select all'}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            <ul className="overflow-hidden rounded-xl border border-rule/70 bg-surface-sunken/25">
                              {group.items.map((item, idx) => {
                                const ready = item.status === 'READY';
                                const checked = focusedMaterialIds.includes(
                                  item.id,
                                );
                                const { name } = splitMaterialTitle(item.title);
                                return (
                                  <li
                                    key={item.id}
                                    className={cn(
                                      'flex items-center gap-2.5 px-2.5 py-2',
                                      idx > 0 && 'border-t border-rule/50',
                                      checked && 'bg-brand-soft/50',
                                      !ready && 'opacity-55',
                                    )}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      disabled={!ready || busy}
                                      onCheckedChange={(v) =>
                                        toggleFocus(item.id, v === true)
                                      }
                                      aria-label={`Focus ${item.title}`}
                                    />
                                    <button
                                      type="button"
                                      disabled={!ready || busy}
                                      onClick={() =>
                                        toggleFocus(item.id, !checked)
                                      }
                                      className="min-w-0 flex-1 text-left"
                                    >
                                      <span className="block truncate text-xs font-medium text-ink">
                                        {name}
                                      </span>
                                      {!ready ? (
                                        <span className="mt-0.5 block text-[10px] text-ink-faint">
                                          {item.status === 'FAILED'
                                            ? 'Failed'
                                            : 'Indexing…'}
                                        </span>
                                      ) : item.kind === 'library' ? (
                                        <span className="mt-0.5 block text-[10px] text-ink-faint">
                                          Library
                                        </span>
                                      ) : item.kind === 'book' ? (
                                        <span className="mt-0.5 block text-[10px] text-ink-faint">
                                          Book
                                        </span>
                                      ) : (
                                        <span className="mt-0.5 block text-[10px] text-ink-faint">
                                          Upload
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {corpusItems.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      onClick={closeAndReset}
                    >
                      {focusActive
                        ? `Use ${focusedMaterialIds.length} material${focusedMaterialIds.length === 1 ? '' : 's'}`
                        : `Use all Ready (${readyCorpus.length})`}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {view === 'library' ? (
                attachableDocuments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-rule px-3 py-4 text-xs text-ink-faint">
                    No Ready library docs left to attach.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {attachableDocuments.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center gap-2 rounded-lg border border-rule/60 bg-surface-sunken/30 px-2.5 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-ink">
                          {doc.title}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 px-2 text-[11px]"
                          disabled={busy}
                          onClick={() => void attachDoc(doc.id)}
                        >
                          {attachingId === doc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Attach'
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MenuRow({
  icon,
  label,
  hint,
  chevron,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  chevron?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-sunken"
      >
        <span className="shrink-0 text-ink-muted">{icon}</span>
        <span className="min-w-0 flex-1">{label}</span>
        {hint ? (
          <span className="text-[11px] text-ink-faint">{hint}</span>
        ) : null}
        {chevron ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        ) : null}
      </button>
    </li>
  );
}
