'use client';

import { apiFetch } from '@/lib/api/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BookOpen,
  Building2,
  ExternalLink,
  GraduationCap,
  Sparkles,
} from '@/components/icons';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { appPath } from '@/lib/basePath';
import { FOUNDERS_EMAIL } from '@/lib/marketing/legal';

type Path = 'teach' | 'student' | 'department';

const CHECKLIST_PREVIEW = [
  'Add course materials',
  'Approve your outline',
  'Publish an assignment',
  'Share the learner join code',
];

export function OnboardingClient({
  userEmail,
  showSchoolEmailBanner,
}: {
  userEmail: string | null;
  showSchoolEmailBanner: boolean;
}) {
  const router = useRouter();
  const [path, setPath] = useState<Path | null>(null);
  const [busy, setBusy] = useState<Path | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  async function provision(target: 'teach' | 'department') {
    setBusy(target);
    setError(null);
    try {
      const res = await apiFetch('/api/onboarding/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: target,
          departmentName:
            target === 'department' ? departmentName.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not set up workspace');
        return;
      }
      router.push(data.redirectTo || appPath('/dashboard/professor'));
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(null);
    }
  }

  async function enrollStudent(e: React.FormEvent) {
    e.preventDefault();
    setEnrollBusy(true);
    setEnrollError(null);
    try {
      const res = await apiFetch('/api/student/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentCode: studentCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEnrollError(data.error || 'Invalid code');
        return;
      }
      router.push(appPath('/dashboard/student'));
      router.refresh();
    } catch {
      setEnrollError('Network error');
    } finally {
      setEnrollBusy(false);
    }
  }

  const bookCallHref = `mailto:${FOUNDERS_EMAIL}?subject=${encodeURIComponent('Department SOL exploration')}`;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      <div>
        <p className="eyebrow">Welcome</p>
        <h1
          className="font-display text-2xl text-ink sm:text-3xl"
          style={{ fontVariationSettings: '"opsz" 36' }}
        >
          What brings you to SOL?
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Pick one path. You can join other workspaces later from Home.
        </p>
      </div>

      {showSchoolEmailBanner ? (
        <p className="rounded-md border border-rule bg-surface-sunken/60 px-3 py-2 text-sm text-ink-muted">
          Your department isn&apos;t on SOL yet. You can still teach in a personal
          workspace — or{' '}
          <Link href={bookCallHref} className="text-brand hover:underline">
            invite a colleague
          </Link>
          .
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {path === null ? (
        <ul className="flex flex-col gap-3">
          <li>
            <button
              type="button"
              onClick={() => setPath('teach')}
              className="flex w-full items-start gap-4 rounded-xl border border-rule bg-surface px-4 py-4 text-left transition-colors hover:border-rule-strong hover:bg-surface-sunken/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rule bg-surface-sunken text-brand">
                <BookOpen className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">I teach</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Start your first course — materials, outline, first assignment.
                </span>
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setPath('student')}
              className="flex w-full items-start gap-4 rounded-xl border border-rule bg-surface px-4 py-4 text-left transition-colors hover:border-rule-strong hover:bg-surface-sunken/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rule bg-surface-sunken text-brand">
                <GraduationCap className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">
                  I&apos;m a student
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Enter the section code or link from your instructor.
                </span>
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setPath('department')}
              className="flex w-full items-start gap-4 rounded-xl border border-rule bg-surface px-4 py-4 text-left transition-colors hover:border-rule-strong hover:bg-surface-sunken/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rule bg-surface-sunken text-brand">
                <Building2 className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">
                  My department is exploring SOL
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Short setup plus a workspace to try while we connect.
                </span>
              </span>
            </button>
          </li>
        </ul>
      ) : null}

      {path === 'teach' ? (
        <div className="flex flex-col gap-6">
          <button
            type="button"
            className="self-start text-xs text-ink-muted hover:text-brand"
            onClick={() => setPath(null)}
          >
            ← All paths
          </button>

          <div className="rounded-xl border border-brand/30 bg-brand-soft/30 p-5">
            <p className="eyebrow text-brand">Start your first course</p>
            <p className="mt-2 text-sm text-ink">
              Upload last term&apos;s materials, paste a syllabus, or start from a
              topic — then approve an outline and publish your first assignment.
            </p>
            <ul className="mt-4 flex flex-col gap-1.5 text-xs text-ink-muted">
              {CHECKLIST_PREVIEW.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              className="mt-5 w-full sm:w-auto"
              disabled={busy !== null}
              onClick={() => provision('teach')}
            >
              {busy === 'teach' ? 'Setting up…' : 'Create my teaching workspace'}
            </Button>
          </div>

          <div className="rounded-xl border border-rule bg-surface px-4 py-4">
            <p className="text-sm font-medium text-ink">Explore a sample course</p>
            <p className="mt-1 text-xs text-ink-muted">
              See how materials, assignments, and the student view fit together.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href={appPath('/docs/about-sol')} target="_blank">
                Open sample walkthrough
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {path === 'student' ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            className="self-start text-xs text-ink-muted hover:text-brand"
            onClick={() => setPath(null)}
          >
            ← All paths
          </button>
          <form onSubmit={enrollStudent} className="grid gap-3">
            <Label htmlFor="student-code">Section code or link token</Label>
            <Input
              id="student-code"
              placeholder="e.g. ABC123 or paste from your instructor"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value)}
              disabled={enrollBusy}
              required
            />
            <p className="text-xs text-ink-muted">
              Nothing else to set up until you join a section.
            </p>
            {enrollError ? (
              <p className="text-sm text-destructive">{enrollError}</p>
            ) : null}
            <Button type="submit" disabled={enrollBusy || !studentCode.trim()}>
              {enrollBusy ? 'Joining…' : 'Join section'}
            </Button>
          </form>
        </div>
      ) : null}

      {path === 'department' ? (
        <div className="flex flex-col gap-4 rounded-xl border border-rule bg-surface px-4 py-4">
          <button
            type="button"
            className="self-start text-xs text-ink-muted hover:text-brand"
            onClick={() => setPath(null)}
          >
            ← All paths
          </button>
          <p className="text-sm font-medium text-ink">Department workspace</p>
          <div className="grid gap-2">
            <Label htmlFor="dept-name">Department name</Label>
            <Input
              id="dept-name"
              placeholder="e.g. Biology"
              value={departmentName}
              onChange={(e) => setDepartmentName(e.target.value)}
              disabled={busy !== null}
            />
          </div>
          <p className="text-xs text-ink-muted">
            We&apos;ll also provision a personal workspace so you can try SOL while
            your program is set up.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy !== null || departmentName.trim().length < 2}
              onClick={() => provision('department')}
            >
              {busy === 'department' ? 'Setting up…' : 'Start department workspace'}
            </Button>
            <Button asChild variant="outline">
              <Link href={bookCallHref}>Book a call</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {userEmail ? (
        <p className="text-xs text-ink-faint">Signed in as {userEmail}</p>
      ) : null}
    </div>
  );
}
