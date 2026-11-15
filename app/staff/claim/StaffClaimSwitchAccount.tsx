'use client';

import { SignOutButton } from '@clerk/nextjs';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export function StaffClaimSwitchAccount({
  inviteEmail,
  sessionEmail,
  loginHref,
  dashboardHref,
}: {
  inviteEmail: string;
  sessionEmail: string;
  loginHref: string;
  dashboardHref: string;
}) {
  return (
    <div className="mt-8 space-y-4">
      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
        <p className="text-ink-muted">
          This invite is for{' '}
          <span className="font-medium text-ink">{inviteEmail}</span>
        </p>
        <p className="mt-1 text-ink-muted">
          You are signed in as{' '}
          <span className="font-medium text-ink">{sessionEmail}</span>
        </p>
      </div>

      <p className="text-sm text-ink-muted">
        Switch accounts, then open this link again to join the section.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SignOutButton redirectUrl={loginHref}>
          <Button type="button">Sign out and switch account</Button>
        </SignOutButton>
        <Button asChild variant="outline">
          <Link href={dashboardHref}>Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
