"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  BookOpen,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  Loader2,
  Plug,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "@/components/icons";
import { toast } from "sonner";

import {
  MaterialPreviewDialog,
  type MaterialPreviewTarget,
} from "@/components/knowledge/MaterialPreviewDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

import { apiUrl, appPath } from "@/lib/basePath";
import type { BookWithChapters } from "@/lib/books";
import { uploadCourseBookFile } from "@/lib/books/clientUpload";
import type {
  ConnectorSummary,
  KnowledgeDocumentSummary,
  KnowledgeProvider,
} from "@/lib/knowledge";
import { cn } from "@/lib/utils";

const ACCEPTED = ".pdf,.docx,.txt,.md,.zip";
const BOOK_ACCEPTED = ".epub,.xml,.pdf";
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_BOOK_BYTES = 50 * 1024 * 1024;
const UNFILED = "Unfiled";

/** Zip imports encode folders as `Week 1 / syllabus` in the title. */
function splitDocPath(title: string): { folder: string; name: string } {
  const parts = title
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return { folder: UNFILED, name: title.trim() || "Untitled" };
  return {
    folder: parts.slice(0, -1).join(" / "),
    name: parts[parts.length - 1]!,
  };
}

function joinDocPath(folder: string, name: string): string {
  const n = name.trim() || "Untitled";
  if (!folder || folder === UNFILED) return n;
  return `${folder} / ${n}`;
}

/** File leaf: strip path separators so rename stays a single segment. */
function sanitizeFileName(raw: string): string {
  return raw
    .replace(/\s*\/\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Folder path: keep nested ` / ` segments, normalize whitespace. */
function sanitizeFolderName(raw: string): string {
  const next = raw
    .split(/\s*\/\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" / ")
    .slice(0, 200);
  return next || UNFILED;
}

function groupDocumentsByFolder(docs: KnowledgeDocumentSummary[]) {
  const map = new Map<string, KnowledgeDocumentSummary[]>();
  for (const doc of docs) {
    const { folder } = splitDocPath(doc.title);
    const list = map.get(folder) ?? [];
    list.push(doc);
    map.set(folder, list);
  }
  const folders = [...map.keys()].sort((a, b) => {
    if (a === UNFILED) return 1;
    if (b === UNFILED) return -1;
    return a.localeCompare(b);
  });
  return { folders, map };
}

function isZipFile(file: File) {
  const mime = (file.type || "").toLowerCase();
  return (
    /\.zip$/i.test(file.name) ||
    mime === "application/zip" ||
    mime === "application/x-zip-compressed"
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export type ConnectorProviderStatus = {
  provider: KnowledgeProvider;
  displayName: string;
  configured: boolean;
};

function statusLabel(status: string) {
  switch (status) {
    case "READY":
    case "connected":
    case "succeeded":
      return status === "READY" ? "Ready" : status;
    case "FAILED":
    case "error":
    case "failed":
      return "Failed";
    case "PROCESSING":
    case "syncing":
      return "Processing";
    case "PENDING":
      return "Queued";
    case "disconnected":
      return "Disconnected";
    default:
      return status;
  }
}

function statusClass(status: string) {
  if (status === "READY" || status === "connected" || status === "succeeded") {
    return "border-brand/30 bg-brand/10 text-foreground";
  }
  if (status === "FAILED" || status === "error" || status === "failed") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted/60 text-muted-foreground";
}

export default function KnowledgeClient({
  workspaceId,
  activeCourseId = null,
  activeCourseTitle = null,
  initialDocuments,
  initialBooks = [],
  initialConnectors,
  initialProviders,
  initialTab = "library",
  teachingBlocked = false,
}: {
  workspaceId: string;
  /** Active course for hosted book imports (EPUB / XML / PDF / Pressbooks URL). */
  activeCourseId?: string | null;
  activeCourseTitle?: string | null;
  initialDocuments: KnowledgeDocumentSummary[];
  /** Hosted books for the active course (imported via Book tab). */
  initialBooks?: BookWithChapters[];
  initialConnectors: ConnectorSummary[];
  initialProviders: ConnectorProviderStatus[];
  initialTab?: "library" | "connections";
  /** When true, hide/disable uploads and mutations (reads still shown). */
  teachingBlocked?: boolean;
}) {
  const router = useRouter();
  const fileInputId = useId();
  const bookFileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const bookFileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [documents, setDocuments] = useState(initialDocuments);
  const [books, setBooks] = useState(initialBooks);
  const [connectors, setConnectors] = useState(initialConnectors);
  const [providers, setProviders] = useState(initialProviders);
  const [tab, setTab] = useState(initialTab);
  const [previewTarget, setPreviewTarget] =
    useState<MaterialPreviewTarget | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [importingBook, setImportingBook] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [bookUrl, setBookUrl] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [bookImportMode, setBookImportMode] = useState<"url" | "file">("file");
  const [versionsDocId, setVersionsDocId] = useState<string | null>(null);
  const [versions, setVersions] = useState<
    Array<{
      id: string;
      version: number;
      ocrUsed: boolean;
      createdAt: string | Date;
      charCount: number | null;
    }>
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<
    "all" | "shared" | "personal"
  >("all");
  const [noStudentRecords, setNoStudentRecords] = useState(false);
  const [addMode, setAddMode] = useState<"file" | "link" | "book">("file");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocValue, setEditingDocValue] = useState("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderValue, setEditingFolderValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const renameLockRef = useRef(false);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);
  useEffect(() => {
    setBooks(initialBooks);
  }, [initialBooks]);
  useEffect(() => {
    setConnectors(initialConnectors);
  }, [initialConnectors]);
  useEffect(() => {
    setProviders(initialProviders);
  }, [initialProviders]);

  async function loadBooks() {
    if (!activeCourseId) {
      setBooks([]);
      return;
    }
    try {
      const res = await fetch(
        apiUrl(
          `/api/professor/books?courseId=${encodeURIComponent(activeCourseId)}`,
        ),
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.books)) {
        setBooks(data.books as BookWithChapters[]);
      }
    } catch {
      /* keep prior list */
    }
  }

  function refresh() {
    void loadBooks();
    startTransition(() => router.refresh());
  }

  function clearFile() {
    setFile(null);
    setFileTitle("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function clearBookFile() {
    setBookFile(null);
    if (bookFileRef.current) bookFileRef.current.value = "";
  }

  function acceptFile(next: File | null | undefined) {
    if (!next) return;
    const zip = isZipFile(next);
    if (zip && next.size > MAX_ZIP_BYTES) {
      toast.error("Zip must be 50 MB or smaller");
      return;
    }
    if (!zip && next.size > MAX_BYTES) {
      toast.error("File must be 50 MB or smaller");
      return;
    }
    setFile(next);
    if (!fileTitle.trim()) {
      setFileTitle(next.name.replace(/\.[^.]+$/, ""));
    }
  }

  function acceptBookFile(next: File | null | undefined) {
    if (!next) return;
    if (next.size > MAX_BOOK_BYTES) {
      toast.error("Book file must be 50 MB or smaller");
      return;
    }
    const lower = next.name.toLowerCase();
    if (
      !lower.endsWith(".epub") &&
      !lower.endsWith(".xml") &&
      !lower.endsWith(".pdf")
    ) {
      toast.error("Upload an EPUB, Pressbooks XML, or PDF");
      return;
    }
    setBookFile(next);
    if (!bookTitle.trim()) {
      setBookTitle(next.name.replace(/\.[^.]+$/, ""));
    }
  }

  async function onShare(documentId: string) {
    setBusyId(documentId);
    try {
      const res = await fetch(
        apiUrl(
          `/api/professor/knowledge/documents/${documentId}?action=share`,
        ),
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not share to library");
        return;
      }
      toast.success("Shared to workspace library");
      refresh();
    } catch {
      toast.error("Could not share to library");
    } finally {
      setBusyId(null);
    }
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a file first");
      return;
    }
    if (!noStudentRecords) {
      toast.error("Confirm this upload does not contain student records");
      return;
    }
    const zip = isZipFile(file);
    const fd = new FormData();
    fd.set("workspaceId", workspaceId);
    fd.set("file", file);
    fd.set("noStudentRecords", "1");
    if (!zip && fileTitle.trim()) fd.set("title", fileTitle.trim());
    setUploading(true);
    try {
      const res = await fetch(apiUrl("/api/professor/knowledge/documents"), {
        method: "POST",
        body: fd,
        credentials: "same-origin",
        redirect: "manual",
      });
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        toast.error("Session expired — refresh and sign in again");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          res.status === 401
            ? "Session expired — refresh and sign in again"
            : res.status === 413
              ? zip
                ? "Zip is too large (max 50 MB)"
                : "File is too large (max 50 MB)"
              : data.error || "Upload failed",
        );
        return;
      }
      if (data.zip) {
        const imported = Number(data.imported ?? 0);
        const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
        toast.success(
          skipped > 0
            ? `Imported ${imported} file${imported === 1 ? "" : "s"} · ${skipped} skipped`
            : `Imported ${imported} file${imported === 1 ? "" : "s"} from zip`,
        );
      } else {
        toast.success("Queued for indexing");
      }
      clearFile();
      refresh();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onAddUrl(e: React.FormEvent) {
    e.preventDefault();
    setAddingLink(true);
    try {
      const res = await fetch(apiUrl("/api/professor/knowledge/documents"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          url: url.trim(),
          title: linkTitle.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not add link");
        return;
      }
      toast.success("Link queued");
      setUrl("");
      setLinkTitle("");
      refresh();
    } catch {
      toast.error("Could not add link");
    } finally {
      setAddingLink(false);
    }
  }

  async function onImportBookUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCourseId) {
      toast.error("Select a course first (top bar) to import a book");
      return;
    }
    if (!bookUrl.trim()) {
      toast.error("Enter a Pressbooks URL");
      return;
    }
    setImportingBook(true);
    try {
      const res = await fetch(apiUrl("/api/professor/books"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: activeCourseId,
          url: bookUrl.trim(),
          title: bookTitle.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not import book");
        return;
      }
      toast.success(
        activeCourseTitle
          ? `Book imported for ${activeCourseTitle}`
          : "Book imported",
      );
      setBookUrl("");
      setBookTitle("");
      refresh();
    } catch {
      toast.error("Could not import book");
    } finally {
      setImportingBook(false);
    }
  }

  async function onImportBookFile(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCourseId) {
      toast.error("Select a course first (top bar) to import a book");
      return;
    }
    if (!bookFile) {
      toast.error("Choose a book file first");
      return;
    }
    setImportingBook(true);
    try {
      const result = await uploadCourseBookFile({
        courseId: activeCourseId,
        file: bookFile,
        title: bookTitle.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.book?.status === "FAILED") {
        toast.error(result.book?.errorMessage || "Book import failed");
        return;
      }
      toast.success(
        result.book?.status === "READY"
          ? activeCourseTitle
            ? `Book uploaded for ${activeCourseTitle}`
            : "Book uploaded"
          : activeCourseTitle
            ? `Book queued for ${activeCourseTitle} — chapters appear when ready`
            : "Book queued — chapters appear when ready",
      );
      clearBookFile();
      setBookTitle("");
      if (result.book) {
        setBooks((prev) => {
          const next = prev.filter((b) => b.id !== result.book!.id);
          return [
            {
              ...result.book!,
              chapters: [],
            } as BookWithChapters,
            ...next,
          ];
        });
      }
      refresh();
    } catch {
      toast.error("Could not upload book");
    } finally {
      setImportingBook(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this document from the workspace library?")) return;
    setBusyId(id);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/knowledge/documents/${id}`),
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Delete failed");
        return;
      }
      toast.success("Removed");
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  function beginEditDoc(d: KnowledgeDocumentSummary) {
    if (renaming || busyId) return;
    const { name } = splitDocPath(d.title);
    setEditingFolder(null);
    setEditingDocId(d.id);
    setEditingDocValue(name);
  }

  function cancelEditDoc() {
    setEditingDocId(null);
    setEditingDocValue("");
  }

  async function commitEditDoc(d: KnowledgeDocumentSummary) {
    if (renameLockRef.current || editingDocId !== d.id) return;
    const { folder, name } = splitDocPath(d.title);
    const nextName = sanitizeFileName(editingDocValue);
    if (!nextName || nextName === name) {
      cancelEditDoc();
      return;
    }
    const nextTitle = joinDocPath(folder, nextName);
    renameLockRef.current = true;
    setEditingDocId(null);
    setRenaming(true);
    setBusyId(d.id);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/knowledge/documents/${d.id}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not rename");
        setEditingDocId(d.id);
        setEditingDocValue(nextName);
        return;
      }
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === d.id ? { ...doc, title: nextTitle } : doc,
        ),
      );
      setEditingDocValue("");
      toast.success("Renamed");
      refresh();
    } catch {
      toast.error("Could not rename");
      setEditingDocId(d.id);
      setEditingDocValue(nextName);
    } finally {
      setBusyId(null);
      setRenaming(false);
      renameLockRef.current = false;
    }
  }

  function beginEditFolder(folder: string) {
    if (renaming || busy) return;
    setEditingDocId(null);
    setEditingFolder(folder);
    setEditingFolderValue(folder);
  }

  function cancelEditFolder() {
    setEditingFolder(null);
    setEditingFolderValue("");
  }

  async function commitEditFolder(fromFolder: string) {
    if (renameLockRef.current || editingFolder !== fromFolder) return;
    const toFolder = sanitizeFolderName(editingFolderValue);
    if (!toFolder || toFolder === fromFolder) {
      cancelEditFolder();
      return;
    }
    renameLockRef.current = true;
    setEditingFolder(null);
    setRenaming(true);
    try {
      const res = await fetch(apiUrl("/api/professor/knowledge/documents"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename_folder",
          workspaceId,
          fromFolder,
          toFolder,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not rename folder");
        setEditingFolder(fromFolder);
        setEditingFolderValue(toFolder);
        return;
      }
      setDocuments((prev) =>
        prev.map((doc) => {
          const { folder, name } = splitDocPath(doc.title);
          if (folder !== fromFolder) return doc;
          return { ...doc, title: joinDocPath(toFolder, name) };
        }),
      );
      setSelectedFolder(toFolder);
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(fromFolder)) {
          next.delete(fromFolder);
          next.add(toFolder);
        }
        return next;
      });
      setEditingFolderValue("");
      const n = typeof data.updated === "number" ? data.updated : 0;
      toast.success(
        n > 0 ? `Renamed folder (${n} file${n === 1 ? "" : "s"})` : "Renamed",
      );
      refresh();
    } catch {
      toast.error("Could not rename folder");
      setEditingFolder(fromFolder);
      setEditingFolderValue(toFolder);
    } finally {
      setRenaming(false);
      renameLockRef.current = false;
    }
  }

  async function onReprocess(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/knowledge/documents/${id}?action=reprocess`),
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Reprocess failed");
        return;
      }
      toast.success("Reprocess queued");
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function openVersions(id: string) {
    setVersionsDocId(id);
    const res = await fetch(apiUrl(`/api/professor/knowledge/documents/${id}`));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Could not load versions");
      return;
    }
    setVersions(data.versions ?? []);
  }

  async function onRestore(documentId: string, versionId: string) {
    setBusyId(documentId);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/knowledge/documents/${documentId}/restore`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Restore failed");
        return;
      }
      toast.success("Restored version — re-indexing");
      setVersionsDocId(null);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function ensureConnector(provider: KnowledgeProvider) {
    const res = await fetch(apiUrl("/api/professor/knowledge/connectors"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, provider }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(
        data.error ||
          "This connector is not available yet. Your SOL admin still needs to finish OAuth setup.",
      );
      return null;
    }
    return data.connector as ConnectorSummary;
  }

  async function onConnect(provider: KnowledgeProvider) {
    const meta = providers.find((p) => p.provider === provider);
    if (meta && !meta.configured) {
      toast.message("Not configured yet", {
        description:
          "SOL still needs the platform OAuth app for this provider. Faculty never enter a client ID.",
      });
      return;
    }
    const existing = connectors.find((c) => c.provider === provider);
    const connector = existing ?? (await ensureConnector(provider));
    if (!connector) return;
    const res = await fetch(
      apiUrl(
        `/api/professor/knowledge/connectors/${connector.id}/authorize`,
      ),
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      toast.error(
        data.error ||
          "Could not start OAuth. Check that the provider credentials are set on the server.",
      );
      return;
    }
    window.location.href = data.url as string;
  }

  async function onSync(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/knowledge/connectors/${id}?action=sync`),
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Sync failed");
        return;
      }
      toast.success("Sync started");
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function onDisconnect(id: string) {
    if (!confirm("Disconnect this source?")) return;
    setBusyId(id);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/knowledge/connectors/${id}`),
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Disconnect failed");
        return;
      }
      toast.success("Disconnected");
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  const busy = uploading || addingLink || importingBook || pending;

  const visibleDocuments = useMemo(() => {
    return documents.filter((d) => {
      if (libraryFilter === "shared") return d.visibility !== "personal";
      if (libraryFilter === "personal") return d.visibility === "personal";
      return true;
    });
  }, [documents, libraryFilter]);

  const { folders, map: folderMap } = useMemo(
    () => groupDocumentsByFolder(visibleDocuments),
    [visibleDocuments],
  );

  const activeFolder =
    selectedFolder && folderMap.has(selectedFolder)
      ? selectedFolder
      : (folders[0] ?? null);

  const folderDocs = activeFolder ? (folderMap.get(activeFolder) ?? []) : [];

  function toggleFolderExpand(folder: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }

  function renderDocRow(d: KnowledgeDocumentSummary) {
    const { name } = splitDocPath(d.title);
    const editing = editingDocId === d.id;
    return (
      <li
        key={d.id}
        className="group flex flex-col gap-2 border-b border-border/60 px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground">
            {d.sourceKind === "URL" ? (
              <Link2 className="h-3.5 w-3.5" />
            ) : d.sourceKind === "CONNECTOR" ? (
              <Plug className="h-3.5 w-3.5" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            {editing ? (
              <Input
                autoFocus
                value={editingDocValue}
                disabled={renaming}
                onChange={(e) => setEditingDocValue(e.target.value)}
                onBlur={() => void commitEditDoc(d)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitEditDoc(d);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEditDoc();
                  }
                }}
                className="h-8 max-w-sm text-sm font-medium"
                aria-label="File name"
              />
            ) : (
              <button
                type="button"
                title={teachingBlocked ? name : "Click to rename"}
                disabled={teachingBlocked}
                onClick={() => beginEditDoc(d)}
                className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline disabled:cursor-default disabled:hover:no-underline"
              >
                {name}
              </button>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  "inline-flex rounded border px-1.5 py-px",
                  statusClass(d.status),
                )}
              >
                {statusLabel(d.status)}
              </span>
              <span>
                {d.visibility === "personal" ? "Private" : "Shared"}
              </span>
              {d.byteSize != null ? (
                <span>{formatBytes(d.byteSize)}</span>
              ) : null}
            </div>
            {d.errorMessage ? (
              <p className="mt-1 text-xs text-destructive">{d.errorMessage}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:opacity-70 sm:transition-opacity sm:group-hover:opacity-100">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setPreviewTarget({
                kind: "knowledge",
                id: d.id,
                title: d.title,
                mimeType: d.mimeType,
                externalUrl: d.externalUrl,
                sourceKind: d.sourceKind,
                status: d.status,
              });
              setPreviewOpen(true);
            }}
          >
            Preview
          </Button>
          {d.visibility === "personal" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={teachingBlocked || busyId === d.id}
              onClick={() => void onShare(d.id)}
            >
              Share
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busyId === d.id}
            onClick={() => void openVersions(d.id)}
          >
            Versions
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={teachingBlocked || busyId === d.id}
            onClick={() => void onReprocess(d.id)}
          >
            Reprocess
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={teachingBlocked || busyId === d.id}
            onClick={() => void onDelete(d.id)}
            aria-label="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <MaterialPreviewDialog
        target={previewTarget}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "library" | "connections")}
      >
        <TabsList>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-6 flex flex-col gap-6">
          {teachingBlocked ? (
            <p className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
              Viewing is available. Finish billing or wait for pilot approval to
              upload, share, or sync documents.
            </p>
          ) : (
          <section className="rounded-xl border border-border bg-card/40">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setAddMode("file")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    addMode === "file"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Upload className="h-3.5 w-3.5" />
                  File
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("link")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    addMode === "link"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  URL
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("book")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    addMode === "book"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Book
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {addMode === "file"
                  ? "PDF · DOCX · TXT · MD · ZIP · private until shared"
                  : addMode === "link"
                    ? "Public http(s) pages only"
                    : activeCourseId
                      ? `EPUB · XML · PDF · Pressbooks · ${activeCourseTitle ?? "active course"}`
                      : "Select a course in the top bar to import a book"}
              </p>
            </div>

            {addMode === "file" ? (
              <form
                onSubmit={onUpload}
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end"
              >
                <input
                  ref={fileRef}
                  id={fileInputId}
                  type="file"
                  accept={ACCEPTED}
                  disabled={busy}
                  className="sr-only"
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                />

                <div className="min-w-0 flex-1 space-y-2">
                  {file ? (
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">
                          {file.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatBytes(file.size)}
                          {isZipFile(file)
                            ? " · folders become prefixes"
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearFile}
                        disabled={busy}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Clear selected file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor={fileInputId}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setDragging(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        acceptFile(e.dataTransfer.files?.[0]);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm transition-colors",
                        dragging
                          ? "border-foreground/40 bg-muted/60"
                          : "border-border bg-background/50 hover:border-foreground/25 hover:bg-muted/40",
                        busy && "pointer-events-none opacity-60",
                      )}
                    >
                      <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Drop or{" "}
                        <span className="font-medium text-foreground underline underline-offset-2">
                          browse
                        </span>
                      </span>
                    </label>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {file && !isZipFile(file) ? (
                      <Input
                        id="kb-title"
                        value={fileTitle}
                        onChange={(e) => setFileTitle(e.target.value)}
                        placeholder="Optional title"
                        disabled={busy}
                        className="h-8 text-sm sm:max-w-xs"
                      />
                    ) : null}
                    <label className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground sm:items-center">
                      <input
                        type="checkbox"
                        className="mt-0.5 sm:mt-0"
                        checked={noStudentRecords}
                        onChange={(e) =>
                          setNoStudentRecords(e.target.checked)
                        }
                        disabled={busy}
                      />
                      <span>No student education records in this upload</span>
                    </label>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || !file || !noStudentRecords}
                  className="shrink-0"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      {file && isZipFile(file) ? "Importing…" : "Uploading…"}
                    </>
                  ) : (
                    <>
                      <Upload />
                      {file && isZipFile(file) ? "Import" : "Upload"}
                    </>
                  )}
                </Button>
              </form>
            ) : addMode === "link" ? (
              <form
                onSubmit={onAddUrl}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end"
              >
                <div className="min-w-0 flex-1 space-y-2 sm:flex sm:gap-2 sm:space-y-0">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="kb-url" className="sr-only">
                      URL
                    </Label>
                    <Input
                      id="kb-url"
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://…"
                      disabled={busy}
                      required
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="sm:w-44">
                    <Label htmlFor="kb-link-title" className="sr-only">
                      Title
                    </Label>
                    <Input
                      id="kb-link-title"
                      value={linkTitle}
                      onChange={(e) => setLinkTitle(e.target.value)}
                      placeholder="Optional title"
                      disabled={busy}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || !url.trim()}
                  className="shrink-0"
                >
                  {addingLink ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Adding…
                    </>
                  ) : (
                    <>
                      <Link2 />
                      Add
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-3 p-3">
                {!activeCourseId ? (
                  <p className="rounded-lg border border-dashed border-border bg-background/50 px-3 py-2.5 text-sm text-muted-foreground">
                    Pick a course in the top bar, then import an EPUB, Pressbooks
                    XML/PDF, or public Pressbooks URL. Books attach to that
                    course&apos;s reader.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5 self-start">
                      <button
                        type="button"
                        onClick={() => {
                          setBookImportMode("file");
                          setBookUrl("");
                        }}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                          bookImportMode === "file"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Upload file
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBookImportMode("url");
                          clearBookFile();
                        }}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                          bookImportMode === "url"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        From URL
                      </button>
                    </div>

                    <Input
                      value={bookTitle}
                      onChange={(e) => setBookTitle(e.target.value)}
                      placeholder="Optional title"
                      disabled={busy}
                      className="h-8 text-sm sm:max-w-xs"
                    />

                    {bookImportMode === "file" ? (
                      <form
                        onSubmit={onImportBookFile}
                        className="flex flex-col gap-3 sm:flex-row sm:items-end"
                      >
                        <input
                          ref={bookFileRef}
                          id={bookFileInputId}
                          type="file"
                          accept={BOOK_ACCEPTED}
                          disabled={busy}
                          className="sr-only"
                          onChange={(e) =>
                            acceptBookFile(e.target.files?.[0])
                          }
                        />
                        <div className="min-w-0 flex-1">
                          {bookFile ? (
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
                              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-foreground">
                                  {bookFile.name}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {formatBytes(bookFile.size)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={clearBookFile}
                                disabled={busy}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Clear selected book file"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <label
                              htmlFor={bookFileInputId}
                              className={cn(
                                "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm transition-colors border-border bg-background/50 hover:border-foreground/25 hover:bg-muted/40",
                                busy && "pointer-events-none opacity-60",
                              )}
                            >
                              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                Drop or{" "}
                                <span className="font-medium text-foreground underline underline-offset-2">
                                  browse
                                </span>{" "}
                                EPUB / XML / PDF
                              </span>
                            </label>
                          )}
                        </div>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={busy || !bookFile}
                          className="shrink-0"
                        >
                          {importingBook ? (
                            <>
                              <Loader2 className="animate-spin" />
                              Uploading…
                            </>
                          ) : (
                            <>
                              <Upload />
                              Upload book
                            </>
                          )}
                        </Button>
                      </form>
                    ) : (
                      <form
                        onSubmit={onImportBookUrl}
                        className="flex flex-col gap-2 sm:flex-row sm:items-end"
                      >
                        <Input
                          type="url"
                          value={bookUrl}
                          onChange={(e) => setBookUrl(e.target.value)}
                          placeholder="https://pressbooks.pub/your-book/"
                          disabled={busy}
                          required
                          className="h-8 text-sm min-w-0 flex-1"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          disabled={busy || !bookUrl.trim()}
                          className="shrink-0"
                        >
                          {importingBook ? (
                            <>
                              <Loader2 className="animate-spin" />
                              Importing…
                            </>
                          ) : (
                            <>
                              <BookOpen />
                              Import book
                            </>
                          )}
                        </Button>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
          )}

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium">Materials</h2>
                {(
                  [
                    ["all", "All"],
                    ["shared", "Shared"],
                    ["personal", "Private"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLibraryFilter(value)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      libraryFilter === value
                        ? "border-foreground/30 bg-muted text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => refresh()}
                disabled={busy}
              >
                <RefreshCw className={cn(pending && "animate-spin")} />
                Refresh
              </Button>
            </div>

            {books.length > 0 ? (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-foreground">
                    Course books
                    {activeCourseTitle ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {activeCourseTitle}
                      </span>
                    ) : null}
                  </h3>
                  {activeCourseId ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={appPath(
                          `/dashboard/professor/materials/${activeCourseId}`,
                        )}
                      >
                        Manage
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {books.map((b) => (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-3 bg-card/20 px-4 py-3"
                    >
                      <div className="min-w-0 flex items-start gap-3">
                        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {b.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5",
                                statusClass(b.status),
                              )}
                            >
                              {statusLabel(b.status)}
                            </span>
                            <span>
                              {b.sourceKind.replace(/_/g, " ")}
                              {b.chapterCount > 0
                                ? ` · ${b.chapterCount} chapter${b.chapterCount === 1 ? "" : "s"}`
                                : ""}
                            </span>
                          </div>
                          {b.errorMessage ? (
                            <p className="mt-1 text-xs text-destructive">
                              {b.errorMessage}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {activeCourseId ? (
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={appPath(
                              `/dashboard/professor/materials/${activeCourseId}`,
                            )}
                          >
                            Open
                          </Link>
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {visibleDocuments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
                {books.length > 0
                  ? "No uploaded files yet. Books for this course are listed above."
                  : "No materials yet. Upload a file, add a URL, import a book, or sync a connection."}
              </div>
            ) : (
              <>
                {/* Desktop: folder sidebar + file pane */}
                <div className="hidden overflow-hidden rounded-xl border border-border md:grid md:grid-cols-[220px_minmax(0,1fr)]">
                  <aside className="border-r border-border bg-card/30">
                    <div className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Folders
                    </div>
                    <ul className="max-h-[420px] overflow-y-auto p-1.5">
                      {folders.map((folder) => {
                        const count = folderMap.get(folder)?.length ?? 0;
                        const selected = folder === activeFolder;
                        const editing = editingFolder === folder;
                        return (
                          <li key={folder}>
                            {editing ? (
                              <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5">
                                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                                <Input
                                  autoFocus
                                  value={editingFolderValue}
                                  disabled={renaming}
                                  onChange={(e) =>
                                    setEditingFolderValue(e.target.value)
                                  }
                                  onBlur={() => void commitEditFolder(folder)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void commitEditFolder(folder);
                                    } else if (e.key === "Escape") {
                                      e.preventDefault();
                                      cancelEditFolder();
                                    }
                                  }}
                                  className="h-7 flex-1 text-sm"
                                  aria-label="Folder name"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                title="Double-click to rename"
                                onClick={() => setSelectedFolder(folder)}
                                onDoubleClick={(e) => {
                                  e.preventDefault();
                                  beginEditFolder(folder);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                                  selected
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                )}
                              >
                                {selected ? (
                                  <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                                ) : (
                                  <Folder className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <span className="min-w-0 flex-1 truncate">
                                  {folder}
                                </span>
                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                  {count}
                                </span>
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </aside>
                  <div className="min-w-0 bg-card/20">
                    <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs text-muted-foreground">
                      <Folder className="h-3 w-3 shrink-0" />
                      {activeFolder && editingFolder === activeFolder ? (
                        <Input
                          autoFocus
                          value={editingFolderValue}
                          disabled={renaming}
                          onChange={(e) =>
                            setEditingFolderValue(e.target.value)
                          }
                          onBlur={() => void commitEditFolder(activeFolder)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void commitEditFolder(activeFolder);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEditFolder();
                            }
                          }}
                          className="h-7 max-w-xs text-xs font-medium"
                          aria-label="Folder name"
                        />
                      ) : (
                        <button
                          type="button"
                          title="Double-click to rename"
                          disabled={!activeFolder}
                          onDoubleClick={() => {
                            if (activeFolder) beginEditFolder(activeFolder);
                          }}
                          className="truncate font-medium text-foreground hover:underline disabled:hover:no-underline"
                        >
                          {activeFolder}
                        </button>
                      )}
                      <span className="tabular-nums">
                        · {folderDocs.length}
                      </span>
                    </div>
                    <ul className="max-h-[420px] overflow-y-auto">
                      {folderDocs.map(renderDocRow)}
                    </ul>
                  </div>
                </div>

                {/* Mobile: expandable folder tree */}
                <div className="overflow-hidden rounded-xl border border-border md:hidden">
                  <ul>
                    {folders.map((folder) => {
                      const docs = folderMap.get(folder) ?? [];
                      const open =
                        expandedFolders.has(folder) ||
                        (expandedFolders.size === 0 &&
                          folder === folders[0]);
                      const editing = editingFolder === folder;
                      return (
                        <li key={folder} className="border-b border-border last:border-b-0">
                          {editing ? (
                            <div className="flex items-center gap-2 bg-card/30 px-3 py-2">
                              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <Input
                                autoFocus
                                value={editingFolderValue}
                                disabled={renaming}
                                onChange={(e) =>
                                  setEditingFolderValue(e.target.value)
                                }
                                onBlur={() => void commitEditFolder(folder)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void commitEditFolder(folder);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelEditFolder();
                                  }
                                }}
                                className="h-8 flex-1 text-sm"
                                aria-label="Folder name"
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              title="Double-click to rename"
                              onClick={() => toggleFolderExpand(folder)}
                              onDoubleClick={(e) => {
                                e.preventDefault();
                                beginEditFolder(folder);
                              }}
                              className="flex w-full items-center gap-2 bg-card/30 px-3 py-2.5 text-left text-sm"
                            >
                              <ChevronRight
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                                  open && "rotate-90",
                                )}
                              />
                              {open ? (
                                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {folder}
                              </span>
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {docs.length}
                              </span>
                            </button>
                          )}
                          {open ? (
                            <ul className="border-t border-border/60 bg-background/40">
                              {docs.map(renderDocRow)}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            )}
          </section>

          {versionsDocId ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium">Version history</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setVersionsDocId(null)}
                >
                  Close
                </Button>
              </div>
              <ul className="flex flex-col gap-2">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">v{v.version}</span>
                      {v.ocrUsed ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          OCR
                        </span>
                      ) : null}
                      {v.charCount != null ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {v.charCount} chars
                        </span>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onRestore(versionsDocId, v.id)}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="connections" className="mt-6 flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            Connect an account once — SOL handles OAuth. Synced files land in
            this library; attach them to courses from Materials.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {providers.map((p) => {
              const c = connectors.find((x) => x.provider === p.provider);
              const ready = p.configured;
              return (
                <li
                  key={p.provider}
                  className={cn(
                    "rounded-2xl border bg-card/40 p-4",
                    ready ? "border-border" : "border-dashed border-border/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{p.displayName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {!ready ? (
                          <span className="inline-flex rounded-full border border-border bg-muted/50 px-2 py-0.5">
                            Setup required
                          </span>
                        ) : c ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5",
                              statusClass(c.status),
                            )}
                          >
                            {statusLabel(c.status)}
                          </span>
                        ) : (
                          "Not connected"
                        )}
                      </div>
                      {!ready ? (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          Platform OAuth app not configured yet. Faculty never
                          enter a client ID — once env is set, Connect works in
                          one click.
                        </p>
                      ) : null}
                      {ready && c?.errorMessage ? (
                        <p className="mt-2 text-xs text-destructive">
                          {c.errorMessage}
                        </p>
                      ) : null}
                      {ready && c?.lastSyncAt ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Last sync{" "}
                          {new Date(c.lastSyncAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                    <Plug
                      className={cn(
                        "h-4 w-4",
                        ready ? "text-muted-foreground" : "text-muted-foreground/50",
                      )}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!ready ? (
                      <Button type="button" size="sm" variant="outline" disabled>
                        Unavailable
                      </Button>
                    ) : !c || c.status === "disconnected" ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={teachingBlocked}
                        onClick={() => void onConnect(p.provider)}
                      >
                        Connect
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={teachingBlocked || busyId === c.id}
                          onClick={() => void onSync(c.id)}
                        >
                          Sync now
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={teachingBlocked || busyId === c.id}
                          onClick={() => void onDisconnect(c.id)}
                        >
                          Disconnect
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}
