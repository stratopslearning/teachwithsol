"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  BookOpen,
  FileText,
  Folder,
  Link2,
  Loader2,
  MoreHorizontal,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl, withBasePath } from "@/lib/basePath";
import type { BookChapterTocItem, BookWithChapters } from "@/lib/books";
import { uploadCourseBookFile } from "@/lib/books/clientUpload";
import {
  chapterDisplayIndexMap,
  countTopLevelChapters,
} from "@/lib/books/hierarchy";
import { groupChaptersForToc } from "@/lib/books/toc";
import type {
  KnowledgeDocumentSummary,
  MaterialSummary,
} from "@/lib/knowledge";
import {
  knowledgeMaterialDisplayStatus,
  type KnowledgeIndexStatus,
} from "@/lib/knowledge/displayStatus";
import { cn } from "@/lib/utils";

const ACCEPTED = ".pdf,.docx,.txt,.md,.zip";
const BOOK_ACCEPTED = ".epub,.xml,.pdf";
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_BYTES = 50 * 1024 * 1024;

function isZipFile(file: File) {
  const mime = (file.type || "").toLowerCase();
  return (
    /\.zip$/i.test(file.name) ||
    mime === "application/zip" ||
    mime === "application/x-zip-compressed"
  );
}
const MAX_BOOK_BYTES = 50 * 1024 * 1024;

function statusLabel(
  status: MaterialSummary["status"] | BookWithChapters["status"],
) {
  switch (status) {
    case "READY":
      return "Ready";
    case "PROCESSING":
      return "Processing";
    case "PENDING":
      return "Queued";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

function statusClass(
  status: MaterialSummary["status"] | BookWithChapters["status"],
) {
  switch (status) {
    case "READY":
      return "border-brand/30 bg-brand/10 text-foreground";
    case "FAILED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "PROCESSING":
    case "PENDING":
      return "border-border bg-muted/60 text-muted-foreground";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function formatBytes(n: number | null) {
  if (n == null || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Zip imports use "folder / file" titles — split for grouped display. */
function splitMaterialTitle(title: string): { folder: string | null; name: string } {
  const idx = title.indexOf(" / ");
  if (idx <= 0) return { folder: null, name: title };
  const folder = title.slice(0, idx).trim();
  const name = title.slice(idx + 3).trim();
  if (!folder || !name) return { folder: null, name: title };
  return { folder, name };
}

export default function MaterialsClient({
  courseId,
  workspaceId = null,
  initialMaterials,
  initialBooks,
  initialLinkedDocuments = [],
  attachableDocuments = [],
}: {
  courseId: string;
  workspaceId?: string | null;
  initialMaterials: MaterialSummary[];
  initialBooks: BookWithChapters[];
  initialLinkedDocuments?: KnowledgeDocumentSummary[];
  attachableDocuments?: KnowledgeDocumentSummary[];
}) {
  const router = useRouter();
  const fileInputId = useId();
  const bookFileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const bookFileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [importingBook, setImportingBook] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [url, setUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [bookUrl, setBookUrl] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [addMode, setAddMode] = useState<"file" | "link" | "book">("file");
  const [bookImportMode, setBookImportMode] = useState<"url" | "file">("url");
  const [books, setBooks] = useState(initialBooks);
  const [materials, setMaterials] = useState(initialMaterials);
  const [linkedDocuments, setLinkedDocuments] = useState(
    initialLinkedDocuments,
  );
  const [attachable, setAttachable] = useState(attachableDocuments);
  const [attachId, setAttachId] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(
    null,
  );
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [noStudentRecords, setNoStudentRecords] = useState(false);
  const [materialFilter, setMaterialFilter] = useState<
    "all" | "attention" | "ready"
  >("all");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] =
    useState<MaterialPreviewTarget | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setBooks(initialBooks);
    setSelectedBookIds(new Set());
    setSelectedChapterIds(new Set());
  }, [initialBooks]);

  useEffect(() => {
    setMaterials(initialMaterials);
    setSelectedMaterialIds(new Set());
  }, [initialMaterials]);

  useEffect(() => {
    setLinkedDocuments(initialLinkedDocuments);
  }, [initialLinkedDocuments]);

  useEffect(() => {
    setAttachable(attachableDocuments);
  }, [attachableDocuments]);

  async function refresh() {
    startTransition(() => router.refresh());
  }

  async function onLinkedVersionAction(
    documentId: string,
    action: "accept_update" | "dismiss_update",
  ) {
    try {
      const res = await fetch(apiUrl("/api/professor/knowledge/links"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, courseId, documentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not update attachment version");
        return;
      }
      toast.success(
        action === "accept_update"
          ? "Now using the new library version"
          : "Kept the pinned version",
      );
      await refresh();
    } catch {
      toast.error("Could not update attachment version");
    }
  }

  async function onAttachFromLibrary(e: React.FormEvent) {
    e.preventDefault();
    if (!attachId) {
      toast.error("Pick a document from the workspace library");
      return;
    }
    setAttaching(true);
    try {
      const res = await fetch(apiUrl("/api/professor/knowledge/links"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, documentId: attachId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not attach document");
        return;
      }
      toast.success("Attached to this course");
      setAttachId("");
      await refresh();
    } catch {
      toast.error("Could not attach document");
    } finally {
      setAttaching(false);
    }
  }

  async function onUnlinkDocument(documentId: string) {
    if (!confirm("Detach this document from the course? It stays in the workspace library.")) {
      return;
    }
    try {
      const res = await fetch(apiUrl("/api/professor/knowledge/links"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, documentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not detach");
        return;
      }
      toast.success("Detached");
      await refresh();
    } catch {
      toast.error("Could not detach");
    }
  }

  async function onRetryDocument(documentId: string) {
    setRetryingId(documentId);
    try {
      const res = await fetch(
        apiUrl(
          `/api/professor/knowledge/documents/${documentId}?action=reprocess`,
        ),
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not retry indexing");
        return;
      }
      toast.success("Re-queued for indexing");
      await refresh();
    } catch {
      toast.error("Could not retry indexing");
    } finally {
      setRetryingId(null);
    }
  }

  function friendlyError(message: string | null | undefined) {
    if (!message) return null;
    if (/Object\.defineProperty/i.test(message)) {
      return "Couldn’t read this PDF — try Retry after refreshing.";
    }
    if (message.length > 120) return `${message.slice(0, 117)}…`;
    return message;
  }

  async function onSetLinkedCorpus(
    documentId: string,
    authoringCorpus: "prior_course" | "this_term",
  ) {
    try {
      const res = await fetch(apiUrl("/api/professor/knowledge/links"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, documentId, authoringCorpus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not update tag");
        return;
      }
      setLinkedDocuments((prev) =>
        prev.map((d) =>
          d.id === documentId ? { ...d, authoringCorpus } : d,
        ),
      );
      toast.success(
        authoringCorpus === "prior_course"
          ? "Tagged as prior course"
          : "Tagged as this term",
      );
    } catch {
      toast.error("Could not update tag");
    }
  }

  async function onSetMaterialCorpus(
    materialId: string,
    authoringCorpus: "prior_course" | "this_term",
  ) {
    try {
      const res = await fetch(
        apiUrl(`/api/professor/materials/${materialId}/corpus`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authoringCorpus }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not update tag");
        return;
      }
      if (data.material) {
        setMaterials((prev) =>
          prev.map((m) => (m.id === materialId ? data.material : m)),
        );
      }
      toast.success(
        authoringCorpus === "prior_course"
          ? "Tagged as prior course"
          : "Tagged as this term",
      );
    } catch {
      toast.error("Could not update tag");
    }
  }

  function toggleId(set: Set<string>, id: string, on: boolean) {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
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
    fd.set("courseId", courseId);
    fd.set("file", file);
    fd.set("noStudentRecords", "1");
    if (!zip && fileTitle.trim()) fd.set("title", fileTitle.trim());
    setUploading(true);
    try {
      const res = await fetch(apiUrl("/api/professor/materials"), {
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
        toast.success("Upload queued for indexing");
      }
      clearFile();
      await refresh();
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
      const res = await fetch(apiUrl("/api/professor/materials"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          url: url.trim(),
          title: linkTitle.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not add link");
        return;
      }
      toast.success("Link queued for indexing");
      setUrl("");
      setLinkTitle("");
      await refresh();
    } catch {
      toast.error("Could not add link");
    } finally {
      setAddingLink(false);
    }
  }

  async function onImportBookUrl(e: React.FormEvent) {
    e.preventDefault();
    setImportingBook(true);
    try {
      const res = await fetch(apiUrl("/api/professor/books"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          url: bookUrl.trim(),
          title: bookTitle.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not import book");
        return;
      }
      toast.success("Book import queued — chapters appear when ready");
      setBookUrl("");
      await refresh();
    } catch {
      toast.error("Could not import book");
    } finally {
      setImportingBook(false);
    }
  }

  async function onImportBookFile(e: React.FormEvent) {
    e.preventDefault();
    if (!bookFile) {
      toast.error("Choose an EPUB, XML, or PDF file");
      return;
    }
    setImportingBook(true);
    try {
      const result = await uploadCourseBookFile({
        courseId,
        file: bookFile,
        title: bookTitle.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const chapterCount = Number(result.book?.chapterCount ?? 0);
      if (result.book?.status === "FAILED") {
        toast.error(result.book?.errorMessage || "Book import failed");
        return;
      }
      toast.success(
        result.book?.status === "READY"
          ? `Imported ${chapterCount} chapter${chapterCount === 1 ? "" : "s"}`
          : "Book upload queued",
      );
      clearBookFile();
      await refresh();
    } catch {
      toast.error("Book upload failed");
    } finally {
      setImportingBook(false);
    }
  }

  async function onCreateOutline(bookId: string) {
    const toastId = toast.loading("Building your course outline…", {
      description: "Usually under a minute — hang tight.",
    });
    try {
      const res = await fetch(
        apiUrl(`/api/professor/books/${bookId}/outline`),
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raw =
          typeof data.error === "string" ? data.error.trim() : "";
        const technical =
          /invalid generated outline|didn't come together|failed to generate|schema error|validation/i.test(
            raw,
          );
        toast.error(
          technical || !raw
            ? "Outline didn’t come together"
            : raw,
          {
            id: toastId,
            description: "Try Design course outline again.",
          },
        );
        return;
      }
      toast.success("Your course outline is ready", {
        id: toastId,
        description: "Opening Authoring so you can review it.",
      });
      router.push(withBasePath(`/dashboard/professor/authoring/${courseId}`));
    } catch {
      toast.error("Outline didn’t come together", {
        id: toastId,
        description: "Try Design course outline again.",
      });
    }
  }

  async function onReprocessBook(bookId: string) {
    if (
      !confirm(
        "Reprocess this book to rebuild chapter HTML for the student reader? Students keep the book; chapters refresh when ready.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        apiUrl(`/api/professor/books/${bookId}/reprocess`),
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Reprocess failed");
        return;
      }
      toast.success("Reprocess queued — chapters update when ready");
      await refresh();
    } catch {
      toast.error("Reprocess failed");
    }
  }

  async function onReleaseBook(bookId: string) {
    if (
      !confirm(
        "Release this book to all your sections for this course? Students will see it in Assignments.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        apiUrl(`/api/professor/books/${bookId}/release`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Release failed");
        return;
      }
      toast.success("Book released to students");
      await refresh();
    } catch {
      toast.error("Release failed");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this material from the course library?")) return;
    try {
      const res = await fetch(apiUrl(`/api/professor/materials/${id}`), {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Delete failed");
        return;
      }
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      setSelectedMaterialIds((prev) => toggleId(prev, id, false));
      toast.success("Material removed");
      await refresh();
    } catch {
      toast.error("Delete failed");
    }
  }

  async function onDeleteSelectedMaterials() {
    const ids = [...selectedMaterialIds];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Remove ${ids.length} material${ids.length === 1 ? "" : "s"} from the library?`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    try {
      const res = await fetch(apiUrl("/api/professor/materials/bulk-delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, materialIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          res.status === 429
            ? "Too many requests — wait a moment and try again"
            : data.error || "Could not remove materials",
        );
        return;
      }
      const removed = new Set(ids);
      setMaterials((prev) => prev.filter((m) => !removed.has(m.id)));
      setSelectedMaterialIds(new Set());
      toast.success(
        `Removed ${data.deleted ?? ids.length} material${
          (data.deleted ?? ids.length) === 1 ? "" : "s"
        }`,
      );
      await refresh();
    } catch {
      toast.error("Could not remove materials");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function onDeleteBook(book: BookWithChapters) {
    const n = countTopLevelChapters(book.chapters, book.title);
    if (
      !confirm(
        n > 0
          ? `Delete “${book.title}” and its ${n} chapter${n === 1 ? "" : "s"}? Students will lose access.`
          : `Delete “${book.title}”?`,
      )
    ) {
      return;
    }
    setDeletingBookId(book.id);
    try {
      const res = await fetch(apiUrl(`/api/professor/books/${book.id}`), {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not delete book");
        return;
      }
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
      setSelectedBookIds((prev) => toggleId(prev, book.id, false));
      setSelectedChapterIds((prev) => {
        const next = new Set(prev);
        for (const ch of book.chapters) next.delete(ch.id);
        return next;
      });
      toast.success("Book deleted");
      await refresh();
    } catch {
      toast.error("Could not delete book");
    } finally {
      setDeletingBookId(null);
    }
  }

  async function onDeleteSelectedBooksConfirm() {
    const ids = [...selectedBookIds];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} book${ids.length === 1 ? "" : "s"} and all their chapters? Students will lose access.`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    try {
      const res = await fetch(apiUrl("/api/professor/books/bulk-delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          res.status === 429
            ? "Too many requests — wait a moment and try again"
            : data.error || "Could not delete books",
        );
        return;
      }
      const gone = new Set(ids);
      const removedChapterIds = books
        .filter((b) => gone.has(b.id))
        .flatMap((b) => b.chapters.map((c) => c.id));
      setBooks((prev) => prev.filter((b) => !gone.has(b.id)));
      setSelectedBookIds(new Set());
      if (removedChapterIds.length > 0) {
        setSelectedChapterIds((prev) => {
          const next = new Set(prev);
          for (const id of removedChapterIds) next.delete(id);
          return next;
        });
      }
      toast.success(
        `Deleted ${data.deleted ?? ids.length} book${
          (data.deleted ?? ids.length) === 1 ? "" : "s"
        }`,
      );
      await refresh();
    } catch {
      toast.error("Could not delete books");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function onDeleteChapter(
    bookId: string,
    chapter: BookChapterTocItem,
  ) {
    if (!confirm(`Remove chapter “${chapter.title}” from this book?`)) return;
    setDeletingChapterId(chapter.id);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/books/${bookId}/chapters/${chapter.id}`),
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not remove chapter");
        return;
      }
      setBooks((prev) =>
        prev.map((b) => {
          if (b.id !== bookId) return b;
          const chapters = b.chapters.filter((c) => c.id !== chapter.id);
          return {
            ...b,
            chapters,
            chapterCount: countTopLevelChapters(chapters, b.title),
          };
        }),
      );
      setSelectedChapterIds((prev) => toggleId(prev, chapter.id, false));
      toast.success("Chapter removed");
      await refresh();
    } catch {
      toast.error("Could not remove chapter");
    } finally {
      setDeletingChapterId(null);
    }
  }

  async function onDeleteSelectedChapters(book: BookWithChapters) {
    const ids = book.chapters
      .map((c) => c.id)
      .filter((id) => selectedChapterIds.has(id));
    if (ids.length === 0) return;
    if (
      !confirm(
        `Remove ${ids.length} chapter${ids.length === 1 ? "" : "s"} from “${book.title}”?`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/books/${book.id}/chapters/bulk-delete`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterIds: ids }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          res.status === 429
            ? "Too many requests — wait a moment and try again"
            : data.error || "Could not remove chapters",
        );
        return;
      }
      const removed = new Set(ids);
      setBooks((prev) =>
        prev.map((b) => {
          if (b.id !== book.id) return b;
          const chapters = b.chapters.filter((c) => !removed.has(c.id));
          return {
            ...b,
            chapters,
            chapterCount: countTopLevelChapters(chapters, b.title),
          };
        }),
      );
      setSelectedChapterIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      toast.success(
        `Removed ${data.deleted ?? ids.length} chapter${
          (data.deleted ?? ids.length) === 1 ? "" : "s"
        }`,
      );
      await refresh();
    } catch {
      toast.error("Could not remove chapters");
    } finally {
      setBulkDeleting(false);
    }
  }

  const busy =
    pending ||
    uploading ||
    addingLink ||
    importingBook ||
    attaching ||
    deletingBookId != null ||
    deletingChapterId != null ||
    bulkDeleting;

  const addSection = (
      <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Add</h2>
          <p className="text-xs text-muted-foreground">
            File · link · book · max 50 MB
          </p>
        </div>

        <Tabs
          value={addMode}
          onValueChange={(v) => setAddMode(v as "file" | "link" | "book")}
          className="max-w-2xl"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="file" disabled={busy}>
              File
            </TabsTrigger>
            <TabsTrigger value="link" disabled={busy}>
              Link
            </TabsTrigger>
            <TabsTrigger value="book" disabled={busy}>
              Book
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-3 outline-none">
            <form onSubmit={onUpload} className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                PDF, DOCX, TXT, MD, or ZIP (folders → title prefixes).
              </p>

              <input
                ref={fileRef}
                id={fileInputId}
                type="file"
                accept={ACCEPTED}
                className="sr-only"
                onChange={(e) => acceptFile(e.target.files?.[0])}
              />

              {file ? (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
                    <FileText className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Clear selected file"
                  >
                    <X className="h-4 w-4" />
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
                    "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center transition-colors",
                    dragging
                      ? "border-foreground/40 bg-muted/60"
                      : "border-border bg-background/50 hover:border-foreground/25 hover:bg-muted/40",
                  )}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
                    <Upload className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="text-sm text-foreground">
                    Drop or{" "}
                    <span className="font-medium underline underline-offset-2">
                      browse
                    </span>
                  </span>
                </label>
              )}

              {file && isZipFile(file) ? (
                <p className="text-xs text-muted-foreground">
                  Zip import creates one course material per supported file.
                  Folder names become title prefixes (e.g. Week 1 / syllabus).
                </p>
              ) : (
                <Input
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                  placeholder="Optional title"
                  disabled={!file && !fileTitle}
                />
              )}
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={noStudentRecords}
                  onCheckedChange={(v) => setNoStudentRecords(v === true)}
                  disabled={busy}
                  className="mt-0.5"
                />
                <span>
                  This upload does not contain student education records
                  (grades, work, or chats).
                </span>
              </label>
              <Button
                type="submit"
                disabled={busy || !file || !noStudentRecords}
                className="w-full sm:w-auto sm:self-start"
              >
                {uploading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    {file && isZipFile(file) ? "Importing…" : "Uploading…"}
                  </>
                ) : (
                  <>
                    <Upload />
                    {file && isZipFile(file) ? "Import zip" : "Upload"}
                  </>
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="link" className="mt-3 outline-none">
            <form onSubmit={onAddUrl} className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Public http(s) URL.
              </p>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                type="url"
                required
              />
              <Input
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="Optional title"
              />
              <Button
                type="submit"
                disabled={busy || !url.trim()}
                className="w-full sm:w-auto sm:self-start"
              >
                {addingLink ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Link2 />
                    Add link
                  </>
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="book" className="mt-3 outline-none">
            <p className="mb-3 text-xs text-muted-foreground">
              EPUB, Pressbooks XML/PDF, or a public Pressbooks URL.
            </p>

            <Tabs
              value={bookImportMode}
              onValueChange={(v) => {
                setBookImportMode(v as "url" | "file");
                if (v === "url") clearBookFile();
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url" disabled={busy}>
                  From URL
                </TabsTrigger>
                <TabsTrigger value="file" disabled={busy}>
                  Upload file
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 grid gap-1.5">
                <Label
                  htmlFor="book-title"
                  className="text-xs text-muted-foreground"
                >
                  Title <span className="font-normal">(optional)</span>
                </Label>
                <Input
                  id="book-title"
                  value={bookTitle}
                  onChange={(e) => setBookTitle(e.target.value)}
                  placeholder="Defaults to the book's own title"
                  disabled={busy}
                />
              </div>

              <TabsContent value="url" className="mt-4 outline-none">
                <form onSubmit={onImportBookUrl} className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor="book-url"
                      className="text-xs text-muted-foreground"
                    >
                      Pressbooks URL
                    </Label>
                    <Input
                      id="book-url"
                      value={bookUrl}
                      onChange={(e) => setBookUrl(e.target.value)}
                      placeholder="https://pressbooks.pub/your-book/"
                      type="url"
                      disabled={busy}
                      autoComplete="url"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={busy || !bookUrl.trim()}
                    className="w-full sm:w-auto sm:justify-self-start"
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
              </TabsContent>

              <TabsContent value="file" className="mt-4 outline-none">
                <form onSubmit={onImportBookFile} className="grid gap-3">
                  <input
                    ref={bookFileRef}
                    id={bookFileInputId}
                    type="file"
                    accept={BOOK_ACCEPTED}
                    className="sr-only"
                    onChange={(e) => acceptBookFile(e.target.files?.[0])}
                  />
                  {bookFile ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {bookFile.name}
                      </span>
                      <button
                        type="button"
                        onClick={clearBookFile}
                        aria-label="Clear file"
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor={bookFileInputId}
                      className={cn(
                        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background/50 px-3 py-5 text-center transition-colors hover:border-rule-strong hover:bg-muted/30",
                        busy && "pointer-events-none opacity-60",
                      )}
                    >
                      <Upload
                        className="h-5 w-5 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="text-sm text-foreground">
                        Drop or choose EPUB / XML / PDF
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Max 50 MB
                      </span>
                    </label>
                  )}
                  <Button
                    type="submit"
                    disabled={busy || !bookFile}
                    className="w-full sm:w-auto sm:justify-self-start"
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
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </section>
  );

  return (
    <div className="mt-4 flex flex-col gap-5">
      <MaterialPreviewDialog
        target={previewTarget}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      {books.length > 0 ? (
        <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
              <h2 className="text-sm font-medium text-foreground">Books</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Student reader · outline design
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {books.length > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={
                      selectedBookIds.size === books.length && books.length > 0
                        ? true
                        : selectedBookIds.size > 0
                          ? "indeterminate"
                          : false
                    }
                    disabled={busy}
                    onCheckedChange={(v) => {
                      if (v === true) {
                        setSelectedBookIds(new Set(books.map((b) => b.id)));
                      } else {
                        setSelectedBookIds(new Set());
                      }
                    }}
                    aria-label="Select all books"
                  />
                  Select all books
                </label>
                {selectedBookIds.size > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void onDeleteSelectedBooksConfirm()}
                  >
                    {bulkDeleting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                    Delete selected ({selectedBookIds.size})
                  </Button>
                ) : null}
              </div>
            ) : null}

            <ul className="flex flex-col gap-2">
              {books.map((b) => {
                const chapterGroups = groupChaptersForToc(b.chapters);
                const n = countTopLevelChapters(b.chapters, b.title);
                const displayIndex = chapterDisplayIndexMap(
                  b.chapters,
                  b.title,
                );
                const bookBusy = deletingBookId === b.id;
                const selectedInBook = b.chapters.filter((c) =>
                  selectedChapterIds.has(c.id),
                ).length;
                const allChaptersSelected =
                  b.chapters.length > 0 && selectedInBook === b.chapters.length;
                return (
                  <li
                    key={b.id}
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border bg-background/60 px-4 py-3",
                      selectedBookIds.has(b.id)
                        ? "border-brand/40"
                        : "border-border",
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        {books.length > 1 ? (
                          <Checkbox
                            className="mt-1"
                            checked={selectedBookIds.has(b.id)}
                            disabled={busy}
                            onCheckedChange={(v) =>
                              setSelectedBookIds((prev) =>
                                toggleId(prev, b.id, v === true),
                              )
                            }
                            aria-label={`Select book ${b.title}`}
                          />
                        ) : null}
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
                              {b.sourceKind.replace("_", " ")}
                              {n > 0
                                ? ` · ${n} chapter${n === 1 ? "" : "s"}`
                                : ""}
                              {b.isReleased ? " · Released" : ""}
                            </span>
                          </div>
                          {b.errorMessage ? (
                            <p className="mt-1 text-xs text-destructive">
                              {b.errorMessage}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {b.status === "READY" && !b.isReleased ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => onReleaseBook(b.id)}
                          >
                            Release
                          </Button>
                        ) : null}
                        {b.status === "READY" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => onCreateOutline(b.id)}
                          >
                            Outline
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              aria-label={`More actions for ${b.title}`}
                            >
                              {bookBusy ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <MoreHorizontal />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {b.status === "READY" ? (
                              <DropdownMenuItem
                                disabled={busy}
                                onSelect={() => void onReprocessBook(b.id)}
                              >
                                <RefreshCw />
                                Reprocess
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={busy}
                              className="text-destructive focus:text-destructive"
                              onSelect={() => onDeleteBook(b)}
                            >
                              <Trash2 />
                              Delete book
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {n > 0 ? (
                      <details
                        className="group border-t border-border pt-2"
                        open={selectedInBook > 0}
                      >
                        <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className="inline-block text-[0.65rem] transition-transform group-open:rotate-90"
                            >
                              ▸
                            </span>
                            Show chapters
                            {selectedInBook > 0
                              ? ` · ${selectedInBook} selected`
                              : ""}
                          </span>
                        </summary>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
                          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <Checkbox
                              checked={
                                allChaptersSelected
                                  ? true
                                  : selectedInBook > 0
                                    ? "indeterminate"
                                    : false
                              }
                              disabled={busy}
                              onCheckedChange={(v) => {
                                setSelectedChapterIds((prev) => {
                                  const next = new Set(prev);
                                  if (v === true) {
                                    for (const ch of b.chapters) next.add(ch.id);
                                  } else {
                                    for (const ch of b.chapters)
                                      next.delete(ch.id);
                                  }
                                  return next;
                                });
                              }}
                              aria-label={`Select all chapters in ${b.title}`}
                            />
                            Select all
                          </label>
                          {selectedInBook > 0 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() =>
                                void onDeleteSelectedChapters(b)
                              }
                            >
                              {bulkDeleting ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Trash2 />
                              )}
                              Delete selected ({selectedInBook})
                            </Button>
                          ) : null}
                        </div>

                        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border bg-card/50 px-2 py-1.5">
                          {chapterGroups.map((g, gi) => (
                            <div
                              key={g.part ?? `ungrouped-${gi}`}
                              className={cn(gi > 0 && "mt-2")}
                            >
                              {g.part ? (
                                <p className="mb-1 px-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                                  {g.part}
                                </p>
                              ) : null}
                              <ul className="flex flex-col">
                                {g.chapters.map((ch) => {
                                  const chBusy =
                                    deletingChapterId === ch.id;
                                  const checked = selectedChapterIds.has(
                                    ch.id,
                                  );
                                  return (
                                    <li
                                      key={ch.id}
                                      className={cn(
                                        "group/ch flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50",
                                        checked && "bg-muted/40",
                                      )}
                                    >
                                      <Checkbox
                                        checked={checked}
                                        disabled={busy}
                                        onCheckedChange={(v) =>
                                          setSelectedChapterIds((prev) =>
                                            toggleId(prev, ch.id, v === true),
                                          )
                                        }
                                        aria-label={`Select chapter ${ch.title}`}
                                      />
                                      <span
                                        className="w-7 shrink-0 tabular-nums text-xs text-muted-foreground"
                                        style={{
                                          marginLeft: `${Math.min(ch.level ?? 0, 2) * 12}px`,
                                        }}
                                      >
                                        {(ch.level ?? 0) > 0
                                          ? "↳"
                                          : displayIndex.has(ch.id)
                                            ? `${displayIndex.get(ch.id)}.`
                                            : "·"}
                                      </span>
                                      <span
                                        className={cn(
                                          'min-w-0 flex-1 truncate text-sm text-foreground/90',
                                          (ch.level ?? 0) > 0 &&
                                            'text-muted-foreground',
                                        )}
                                      >
                                        {ch.title}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          onDeleteChapter(b.id, ch)
                                        }
                                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-destructive/10 hover:text-destructive hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 sm:opacity-0 sm:group-hover/ch:opacity-100"
                                        aria-label={`Delete chapter ${ch.title}`}
                                      >
                                        {chBusy ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3.5 w-3.5" />
                                        )}
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}


      <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-5">
        {(() => {
          type MaterialRow =
            | { kind: "linked"; id: string; doc: KnowledgeDocumentSummary }
            | { kind: "upload"; id: string; material: MaterialSummary };

          const statusRank = (s: string) =>
            s === "FAILED" ? 0 : s === "PROCESSING" || s === "PENDING" ? 1 : 2;

          const rows: MaterialRow[] = [
            ...linkedDocuments.map(
              (doc): MaterialRow => ({ kind: "linked", id: doc.id, doc }),
            ),
            ...materials.map(
              (material): MaterialRow => ({
                kind: "upload",
                id: material.id,
                material,
              }),
            ),
          ].sort((a, b) => {
            const sa = a.kind === "linked" ? a.doc.status : a.material.status;
            const sb = b.kind === "linked" ? b.doc.status : b.material.status;
            const rank = statusRank(sa) - statusRank(sb);
            if (rank !== 0) return rank;
            const ta = a.kind === "linked" ? a.doc.title : a.material.title;
            const tb = b.kind === "linked" ? b.doc.title : b.material.title;
            return ta.localeCompare(tb);
          });

          const filtered = rows.filter((row) => {
            const status =
              row.kind === "linked" ? row.doc.status : row.material.status;
            const update =
              row.kind === "linked" && !!row.doc.updateAvailableVersionId;
            if (materialFilter === "ready") return status === "READY" && !update;
            if (materialFilter === "attention") {
              return (
                status === "FAILED" ||
                status === "PROCESSING" ||
                status === "PENDING" ||
                update
              );
            }
            return true;
          });

          const attentionCount = rows.filter((row) => {
            const status =
              row.kind === "linked" ? row.doc.status : row.material.status;
            return (
              status === "FAILED" ||
              status === "PROCESSING" ||
              status === "PENDING" ||
              (row.kind === "linked" && !!row.doc.updateAvailableVersionId)
            );
          }).length;

          const uploadRows = materials;
          const selectAllChecked =
            uploadRows.length > 0 &&
            selectedMaterialIds.size === uploadRows.length
              ? true
              : selectedMaterialIds.size > 0
                ? ("indeterminate" as const)
                : false;

          type MaterialGroup = {
            folder: string | null;
            label: string;
            items: MaterialRow[];
          };

          const groupMap = new Map<string, MaterialRow[]>();
          for (const row of filtered) {
            const title =
              row.kind === "linked" ? row.doc.title : row.material.title;
            const { folder } = splitMaterialTitle(title);
            const key = folder ?? "";
            const list = groupMap.get(key) ?? [];
            list.push(row);
            groupMap.set(key, list);
          }
          const materialGroups: MaterialGroup[] = [...groupMap.entries()]
            .map(([key, items]) => ({
              folder: key || null,
              label: key || "Course files",
              items,
            }))
            .sort((a, b) => {
              if (a.folder == null && b.folder != null) return 1;
              if (a.folder != null && b.folder == null) return -1;
              return a.label.localeCompare(b.label);
            });
          const useFolderGroups =
            materialGroups.length > 1 ||
            (materialGroups.length === 1 && materialGroups[0]?.folder != null);

          return (
            <>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium text-foreground">
                    Uploads & library
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {rows.length === 0
                      ? "None attached"
                      : `${rows.length} for tutor + authoring`}
                    {workspaceId ? (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          className="underline underline-offset-2"
                          href={withBasePath("/dashboard/workspace/knowledge")}
                        >
                          Knowledge
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
                    {(
                      [
                        ["all", "All"],
                        ["attention", "Needs attention"],
                        ["ready", "Ready"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setMaterialFilter(key)}
                        className={cn(
                          "rounded-sm px-2.5 py-1 transition-colors",
                          materialFilter === key
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                        {key === "attention" && attentionCount > 0
                          ? ` (${attentionCount})`
                          : ""}
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
              </div>

              {attachable.filter((d) => d.visibility !== "personal").length >
              0 ? (
                <form
                  onSubmit={onAttachFromLibrary}
                  className="mb-3 flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center"
                >
                  <Select
                    value={attachId || undefined}
                    onValueChange={setAttachId}
                    disabled={busy || attaching}
                  >
                    <SelectTrigger
                      id="attach-doc"
                      size="sm"
                      aria-label="Attach from shared library"
                      className="h-9 min-w-0 w-full flex-1"
                    >
                      <SelectValue placeholder="Attach from library…" />
                    </SelectTrigger>
                    <SelectContent>
                      {attachable
                        .filter((d) => d.visibility !== "personal")
                        .map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.title}
                            {d.connectorId ? " (synced)" : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || attaching || !attachId}
                  >
                    {attaching ? <Loader2 className="animate-spin" /> : null}
                    Attach
                  </Button>
                </form>
              ) : null}

              {rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
                  No uploads yet — use Add below, or attach from Knowledge.
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                  Nothing in this filter
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {uploadRows.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={selectAllChecked}
                          disabled={busy}
                          onCheckedChange={(v) => {
                            if (v === true) {
                              setSelectedMaterialIds(
                                new Set(uploadRows.map((m) => m.id)),
                              );
                            } else {
                              setSelectedMaterialIds(new Set());
                            }
                          }}
                          aria-label="Select all legacy uploads"
                        />
                        Select uploads
                      </label>
                      {selectedMaterialIds.size > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void onDeleteSelectedMaterials()}
                        >
                          {bulkDeleting ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                          Delete ({selectedMaterialIds.size})
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    {(useFolderGroups ? materialGroups : [{ folder: null, label: "", items: filtered }]).map(
                      (group) => {
                        const list = (
                          <ul
                            className={cn(
                              "divide-y divide-border",
                              useFolderGroups
                                ? "border-t border-border"
                                : "rounded-xl border border-border bg-card/30",
                            )}
                          >
                            {group.items.map((row) => {
                      if (row.kind === "linked") {
                        const d = row.doc;
                        const err = friendlyError(d.errorMessage);
                        return (
                          <li
                            key={`linked-${d.id}`}
                            className="flex items-center gap-3 px-3 py-2.5"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                              {d.sourceKind === "URL" ? (
                                <Link2 className="h-3.5 w-3.5" aria-hidden />
                              ) : (
                                <FileText
                                  className="h-3.5 w-3.5"
                                  aria-hidden
                                />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="truncate text-sm font-medium text-foreground">
                                  {splitMaterialTitle(d.title).name}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex shrink-0 rounded-full border px-1.5 py-px text-[11px] leading-4",
                                    statusClass(d.status),
                                  )}
                                >
                                  {statusLabel(d.status)}
                                </span>
                                {d.authoringCorpus === "prior_course" ? (
                                  <span className="inline-flex shrink-0 rounded-full border border-brand/30 bg-brand/10 px-1.5 py-px text-[11px] leading-4 text-foreground">
                                    Prior
                                  </span>
                                ) : null}
                                {d.updateAvailableVersionId ? (
                                  <span className="inline-flex shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[11px] leading-4 text-foreground">
                                    Update
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                {[
                                  d.connectorId ? "Synced" : "Library",
                                  formatBytes(d.byteSize),
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                                {err ? (
                                  <span className="text-destructive">
                                    {" · "}
                                    {err}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {d.status === "FAILED" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy || retryingId === d.id}
                                  onClick={() => void onRetryDocument(d.id)}
                                >
                                  {retryingId === d.id ? (
                                    <Loader2 className="animate-spin" />
                                  ) : null}
                                  Retry
                                </Button>
                              ) : null}
                              {d.updateAvailableVersionId ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    void onLinkedVersionAction(
                                      d.id,
                                      "accept_update",
                                    )
                                  }
                                >
                                  Use new
                                </Button>
                              ) : null}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 px-0"
                                    disabled={busy}
                                    aria-label={`Actions for ${d.title}`}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setPreviewTarget({
                                        kind: "knowledge",
                                        id: d.id,
                                        title: d.title,
                                        mimeType: d.mimeType,
                                        externalUrl: d.externalUrl,
                                        sourceKind: d.sourceKind,
                                        status: d.status,
                                        courseId,
                                      });
                                      setPreviewOpen(true);
                                    }}
                                  >
                                    Preview
                                  </DropdownMenuItem>
                                  {d.updateAvailableVersionId ? (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        void onLinkedVersionAction(
                                          d.id,
                                          "dismiss_update",
                                        )
                                      }
                                    >
                                      Keep current version
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem
                                    onClick={() =>
                                      void onSetLinkedCorpus(
                                        d.id,
                                        d.authoringCorpus === "prior_course"
                                          ? "this_term"
                                          : "prior_course",
                                      )
                                    }
                                  >
                                    {d.authoringCorpus === "prior_course"
                                      ? "Mark this term"
                                      : "Mark prior course"}
                                  </DropdownMenuItem>
                                  {d.status === "FAILED" ? (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        void onRetryDocument(d.id)
                                      }
                                    >
                                      Retry indexing
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() =>
                                      void onUnlinkDocument(d.id)
                                    }
                                  >
                                    Detach from course
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </li>
                        );
                      }

                      const m = row.material;
                      const checked = selectedMaterialIds.has(m.id);
                      const err = friendlyError(m.errorMessage);
                      return (
                        <li
                          key={`upload-${m.id}`}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5",
                            checked && "bg-brand/5",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={busy}
                            onCheckedChange={(v) =>
                              setSelectedMaterialIds((prev) =>
                                toggleId(prev, m.id, v === true),
                              )
                            }
                            aria-label={`Select ${m.title}`}
                          />
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                            {m.sourceType === "URL" ? (
                              <Link2 className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <FileText className="h-3.5 w-3.5" aria-hidden />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="truncate text-sm font-medium text-foreground">
                                {splitMaterialTitle(m.title).name}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex shrink-0 rounded-full border px-1.5 py-px text-[11px] leading-4",
                                  statusClass(m.status),
                                )}
                              >
                                {statusLabel(m.status)}
                              </span>
                              {m.authoringCorpus === "prior_course" ? (
                                <span className="inline-flex shrink-0 rounded-full border border-brand/30 bg-brand/10 px-1.5 py-px text-[11px] leading-4 text-foreground">
                                  Prior
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {[
                                m.sourceType === "URL" ? "Link" : "Upload",
                                formatBytes(m.byteSize),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              {err ? (
                                <span className="text-destructive">
                                  {" · "}
                                  {err}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 px-0"
                                disabled={busy}
                                aria-label={`Actions for ${m.title}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setPreviewTarget({
                                    kind: "legacy",
                                    id: m.id,
                                    title: m.title,
                                    mimeType: m.mimeType,
                                    externalUrl: m.externalUrl,
                                    status: m.status,
                                  });
                                  setPreviewOpen(true);
                                }}
                              >
                                Preview
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  void onSetMaterialCorpus(
                                    m.id,
                                    m.authoringCorpus === "prior_course"
                                      ? "this_term"
                                      : "prior_course",
                                  )
                                }
                              >
                                {m.authoringCorpus === "prior_course"
                                  ? "Mark this term"
                                  : "Mark prior course"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => onDelete(m.id)}
                              >
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </li>
                      );
                            })}
                          </ul>
                        );

                        if (!useFolderGroups) {
                          return (
                            <div key="__flat">{list}</div>
                          );
                        }

                        return (
                          <details
                            key={group.folder ?? "__root"}
                            open
                            className="overflow-hidden rounded-xl border border-border bg-card/30"
                          >
                            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                              <Folder
                                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                {group.label}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {group.items.length}{" "}
                                {group.items.length === 1 ? "file" : "files"}
                              </span>
                            </summary>
                            {list}
                          </details>
                        );
                      },
                    )}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </section>

      {addSection}
    </div>
  );
}
