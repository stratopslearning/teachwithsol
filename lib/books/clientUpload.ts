/**
 * Browser helper: upload a book file, using S3 presigned PUT when the file
 * would exceed Vercel's ~4.5 MB request body limit.
 */
import { apiFetch } from '@/lib/api/client';
import { BOOK_DIRECT_UPLOAD_THRESHOLD_BYTES } from '@/lib/books/constants';
import type { BookSummary } from '@/lib/books/types';

type UploadResult =
  | { ok: true; book: BookSummary }
  | { ok: false; status: number; error: string };

function bookUploadErrorMessage(status: number, fallback?: string): string {
  if (status === 401) return 'Session expired — refresh and sign in again';
  if (status === 413) {
    return 'Upload blocked by the host body limit — try again (direct storage upload).';
  }
  return fallback || 'Could not upload book';
}

async function putFileToPresignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Storage upload failed (${res.status}). Try again; if it keeps failing, storage signing/CORS may be misconfigured.`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        'Browser blocked the storage upload (CSP/network). Hard-refresh after deploy and try again.',
    };
  }
}

/** Upload a book file for a course; returns the created book summary. */
export async function uploadCourseBookFile(opts: {
  courseId: string;
  file: File;
  title?: string;
}): Promise<UploadResult> {
  const { courseId, file, title } = opts;
  const useDirect = file.size >= BOOK_DIRECT_UPLOAD_THRESHOLD_BYTES;

  if (useDirect) {
    const beginRes = await apiFetch('/api/professor/books/direct-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        action: 'begin',
        courseId,
        fileName: file.name || 'book.bin',
        mimeType: file.type || 'application/octet-stream',
        byteSize: file.size,
        title: title?.trim() || undefined,
      }),
    });
    const beginData = await beginRes.json().catch(() => ({}));
    if (!beginRes.ok) {
      return {
        ok: false,
        status: beginRes.status,
        error: bookUploadErrorMessage(beginRes.status, beginData.error),
      };
    }

    const put = await putFileToPresignedUrl(
      String(beginData.uploadUrl),
      file,
      String(beginData.contentType || 'application/octet-stream'),
    );
    if (!put.ok) {
      return { ok: false, status: 502, error: put.error };
    }

    const completeRes = await apiFetch('/api/professor/books/direct-upload',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'complete',
          bookId: beginData.bookId,
          expectedByteSize: file.size,
        }),
      },
    );
    const completeData = await completeRes.json().catch(() => ({}));
    if (!completeRes.ok) {
      return {
        ok: false,
        status: completeRes.status,
        error: bookUploadErrorMessage(completeRes.status, completeData.error),
      };
    }
    return { ok: true, book: completeData.book as BookSummary };
  }

  const fd = new FormData();
  fd.set('courseId', courseId);
  fd.set('file', file);
  if (title?.trim()) fd.set('title', title.trim());

  const res = await apiFetch('/api/professor/books', {
    method: 'POST',
    body: fd,
    credentials: 'same-origin',
    redirect: 'manual',
  });
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    return {
      ok: false,
      status: 401,
      error: 'Session expired — refresh and sign in again',
    };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: bookUploadErrorMessage(res.status, data.error),
    };
  }
  return { ok: true, book: data.book as BookSummary };
}
