import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';

import { StaffClaimSwitchAccount } from '@/app/staff/claim/StaffClaimSwitchAccount';
import { Button } from '@/components/ui/button';
import {
  claimSectionStaffInvite,
  peekSectionStaffInvite,
} from '@/lib/authz/staffInvites';
import { appPath, withBasePath } from '@/lib/basePath';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { appRedirect } from '@/lib/serverRedirect';

export const dynamic = 'force-dynamic';

function roleLabel(role: string): string {
  if (role === 'co_instructor') return 'Instructor';
  if (role === 'ta') return 'Teaching assistant';
  if (role === 'grader') return 'Grader';
  return role;
}

export default async function StaffClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const { userId } = await auth();
  const user = userId ? await getOrCreateUser() : null;

  const claimPath = token
    ? `/staff/claim?token=${encodeURIComponent(token)}`
    : '/staff/claim';
  const loginHref = appPath(
    `/login?redirect_url=${encodeURIComponent(withBasePath(claimPath))}`,
  );
  const dashboardHref = appPath('/dashboard');

  if (!token) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Staff invite
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">Join a section</h1>
        <p className="mt-3 text-sm text-destructive">
          Missing invite token. Ask your colleague for a fresh claim link.
        </p>
        <p className="mt-8">
          <Button asChild variant="outline">
            <Link href={dashboardHref}>Back to dashboard</Link>
          </Button>
        </p>
      </main>
    );
  }

  let peek: Awaited<ReturnType<typeof peekSectionStaffInvite>>;
  try {
    peek = await peekSectionStaffInvite(token);
  } catch (err) {
    console.error('Staff invite peek failed:', err);
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Staff invite
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">
          Could not open invite
        </h1>
        <p className="mt-3 text-sm text-destructive">
          Something went wrong loading this invite. Try again, or ask the
          instructor to resend the link.
        </p>
        <p className="mt-8">
          <Button asChild variant="outline">
            <Link href={dashboardHref}>Back to dashboard</Link>
          </Button>
        </p>
      </main>
    );
  }

  if (!peek.ok) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Staff invite
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">
          Could not claim invite
        </h1>
        <p className="mt-3 text-sm text-destructive">{peek.error}</p>
        <p className="mt-8">
          <Button asChild variant="outline">
            <Link href={dashboardHref}>Back to dashboard</Link>
          </Button>
        </p>
      </main>
    );
  }

  const inviteEmail = peek.email.trim().toLowerCase();
  const sessionEmail = user?.email?.trim().toLowerCase() ?? '';
  const emailMatches =
    Boolean(sessionEmail) && sessionEmail === inviteEmail;

  let disabledReason: string | null = null;
  if (peek.claimed) disabledReason = 'This invite was already claimed.';
  else if (peek.expired) {
    disabledReason =
      'This invite has expired. Ask your colleague for a new link.';
  }

  if (!userId || !user) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Staff invite
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">
          Join as {roleLabel(peek.role).toLowerCase()}
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          Sign in with the email you were invited with to join this section.
          You will go straight to the course — no extra setup.
        </p>
        <div className="mt-8 space-y-4">
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <p className="font-medium text-ink">{roleLabel(peek.role)} invite</p>
            <p className="mt-1 text-ink-muted">
              For <span className="text-ink">{inviteEmail}</span>
            </p>
          </div>
          {disabledReason ? (
            <p className="text-sm text-destructive">{disabledReason}</p>
          ) : (
            <Button asChild>
              <Link href={loginHref}>Sign in to claim</Link>
            </Button>
          )}
        </div>
      </main>
    );
  }

  if (disabledReason) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Staff invite
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">
          Could not claim invite
        </h1>
        <p className="mt-3 text-sm text-destructive">{disabledReason}</p>
        <p className="mt-8">
          <Button asChild variant="outline">
            <Link href={dashboardHref}>Back to dashboard</Link>
          </Button>
        </p>
      </main>
    );
  }

  if (!emailMatches) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Staff invite
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">
          Wrong account
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          This {roleLabel(peek.role).toLowerCase()} invite belongs to a
          different email than the one you are signed in with.
        </p>
        <StaffClaimSwitchAccount
          inviteEmail={inviteEmail}
          sessionEmail={sessionEmail || user.email}
          loginHref={loginHref}
          dashboardHref={dashboardHref}
        />
      </main>
    );
  }

  let result: Awaited<ReturnType<typeof claimSectionStaffInvite>>;
  try {
    result = await claimSectionStaffInvite({
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    console.error('Staff invite claim failed:', err);
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Staff invite
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">
          Could not claim invite
        </h1>
        <p className="mt-3 text-sm text-destructive">
          Something went wrong while claiming this invite. Try again, or ask
          the instructor to resend the link.
        </p>
        <p className="mt-8">
          <Button asChild variant="outline">
            <Link href={dashboardHref}>Back to dashboard</Link>
          </Button>
        </p>
      </main>
    );
  }

  if (!result.ok) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Staff invite
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">
          Could not claim invite
        </h1>
        <p className="mt-3 text-sm text-destructive">{result.error}</p>
        <p className="mt-8">
          <Button asChild variant="outline">
            <Link href={dashboardHref}>Back to dashboard</Link>
          </Button>
        </p>
      </main>
    );
  }

  // Instructors land on the course hub section; TAs/graders use the TA desk.
  // Binding/enrollment from the claim skips onboarding on the next visit.
  if (result.role === 'co_instructor') {
    try {
      const { fetchSectionById } = await import('@/lib/db/entityScopedReads');
      const section = await fetchSectionById(result.sectionId);
      if (section?.courseId) {
        appRedirect(
          `/dashboard/professor/courses/${section.courseId}/sections/${result.sectionId}`,
        );
      }
    } catch (err) {
      console.error('Staff claim course lookup failed:', err);
    }
    appRedirect(`/dashboard/professor/sections/${result.sectionId}`);
  }
  appRedirect('/dashboard/ta');
}
