import Link from 'next/link';

import { claimSectionStaffInvite } from '@/lib/authz/staffInvites';
import { withBasePath } from '@/lib/basePath';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { appRedirect } from '@/lib/serverRedirect';

export const dynamic = 'force-dynamic';

export default async function StaffClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await getOrCreateUser();
  if (!user) appRedirect('/login');

  const { token } = await searchParams;
  if (!token) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-xl font-semibold">Staff invite</h1>
        <p className="mt-2 text-sm text-ink-muted">Missing invite token.</p>
      </main>
    );
  }

  const result = await claimSectionStaffInvite({
    token,
    user: { id: user.id, email: user.email },
  });

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-xl font-semibold">Could not claim invite</h1>
        <p className="mt-2 text-sm text-destructive">{result.error}</p>
        <p className="mt-6">
          <Link href={withBasePath('/dashboard')} className="text-brand underline">
            Back to dashboard
          </Link>
        </p>
      </main>
    );
  }

  // Instructors land on the faculty dashboard; TAs/graders use the TA desk.
  if (result.role === 'co_instructor') {
    appRedirect(`/dashboard/professor/sections/${result.sectionId}`);
  }
  appRedirect('/dashboard/ta');
}
