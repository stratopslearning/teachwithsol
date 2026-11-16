'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BookOpen } from '@/components/icons';

import { DeleteWorkspaceButton } from '@/app/dashboard/admin/workspaces/DeleteWorkspaceButton';
import { GrantCompAccessButton } from '@/app/dashboard/admin/workspaces/GrantCompAccessButton';
import { ResendOwnerInviteButton } from '@/app/dashboard/admin/workspaces/ResendOwnerInviteButton';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LocalDateTime } from '@/components/timezone/LocalDateTime';
import { appPath } from '@/lib/basePath';

export type WorkspaceDirectoryRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  createdAt: string | Date;
  seatCap: number | null;
  licensePlan: string | null;
  licenseStatus: string | null;
  billingProvider: string | null;
  ownerEmail: string | null;
  claimStatus: 'claimed' | 'pending' | 'expired' | 'none';
  courseCount: number;
  childCount: number;
  isDefault: boolean;
  alreadyChurned: boolean;
  /** ISO date when complimentary window ends, if set. */
  licensePeriodEnd: string | null;
  /** Live Stripe subscription id when billed. */
  stripeSubscriptionId: string | null;
};

export function WorkspacesDirectory({ rows }: { rows: WorkspaceDirectoryRow[] }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [billingFilter, setBillingFilter] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (billingFilter === 'stripe' && r.billingProvider !== 'stripe')
        return false;
      if (billingFilter === 'manual' && r.billingProvider !== 'manual')
        return false;
      if (billingFilter === 'unpaid') {
        const unpaid =
          r.billingProvider === 'stripe' &&
          (r.licenseStatus === 'trialing' || !r.licenseStatus);
        if (!unpaid) return false;
      }
      if (billingFilter === 'pending_claim' && r.claimStatus !== 'pending')
        return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.ownerEmail?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, typeFilter, billingFilter]);

  return (
    <div className="flex flex-col gap-4">
      <AdminFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, slug, owner…"
        filterValue={typeFilter}
        onFilterChange={setTypeFilter}
        filterLabel="Type"
        filterOptions={[
          { value: 'all', label: 'All types' },
          { value: 'creator', label: 'Creator' },
          { value: 'business', label: 'Business' },
          { value: 'department', label: 'Department' },
          { value: 'institution', label: 'Institution' },
        ]}
        secondaryValue={billingFilter}
        onSecondaryChange={setBillingFilter}
        secondaryLabel="Billing"
        secondaryOptions={[
          { value: 'all', label: 'All billing' },
          { value: 'stripe', label: 'Stripe' },
          { value: 'manual', label: 'Manual' },
          { value: 'unpaid', label: 'Awaiting Stripe' },
          { value: 'pending_claim', label: 'Pending claim' },
        ]}
      />
      <div className="rounded-lg border border-rule/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Claim</TableHead>
              <TableHead>License</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Created</TableHead>
              <TableHead
                className={[
                  'sticky right-0 z-20 w-[1%] text-right',
                  'bg-surface-sunken',
                  'shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.45)]',
                  'border-l border-rule/60',
                ].join(' ')}
              >
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-ink-muted"
                >
                  No workspaces match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((w) => (
                <TableRow key={w.id} className="group">
                  <TableCell>
                    <div className="font-medium text-ink">{w.name}</div>
                    <div className="text-xs text-ink-muted">{w.slug}</div>
                  </TableCell>
                  <TableCell>
                    <AdminStatusBadge kind="generic" value={w.type} />
                  </TableCell>
                  <TableCell className="text-sm text-ink-muted">
                    {w.ownerEmail ?? '—'}
                  </TableCell>
                  <TableCell>
                    <AdminStatusBadge kind="claim" value={w.claimStatus} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {w.licenseStatus ? (
                        <AdminStatusBadge
                          kind="license"
                          value={w.licenseStatus}
                        />
                      ) : (
                        '—'
                      )}
                      <span className="text-[0.65rem] text-ink-faint">
                        {w.licensePlan ?? ''}
                        {w.billingProvider ? ` · ${w.billingProvider}` : ''}
                        {w.status === 'suspended'
                          ? ' · pilot revoked'
                          : w.licenseStatus === 'trialing' &&
                              !w.licensePeriodEnd &&
                              !w.stripeSubscriptionId
                            ? ' · indefinite pilot'
                            : w.licensePeriodEnd
                              ? ` · until ${new Date(w.licensePeriodEnd).toLocaleDateString()}`
                              : w.licenseStatus === 'incomplete' &&
                                  !w.stripeSubscriptionId
                                ? ' · awaiting pilot/billing'
                                : ''}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {w.seatCap != null ? w.seatCap.toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-ink-muted whitespace-nowrap">
                    <LocalDateTime value={w.createdAt} dateOnly />
                  </TableCell>
                  <TableCell
                    className={[
                      'sticky right-0 z-10 text-right',
                      'bg-surface group-hover:bg-surface-sunken/60',
                      'shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.45)]',
                      'border-l border-rule/60',
                    ].join(' ')}
                  >
                    <div className="inline-flex items-center justify-end gap-0.5">
                      <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                        <Link
                          href={appPath(
                            `/dashboard/admin/courses?workspaceId=${encodeURIComponent(w.id)}`,
                          )}
                          title="Open catalog"
                        >
                          <BookOpen className="h-3.5 w-3.5" aria-hidden />
                          <span className="sr-only">Catalog</span>
                        </Link>
                      </Button>
                      <ResendOwnerInviteButton
                        workspaceId={w.id}
                        name={w.name}
                        ownerEmail={w.ownerEmail}
                        claimStatus={w.claimStatus}
                      />
                      <GrantCompAccessButton
                        workspaceId={w.id}
                        name={w.name}
                        alreadyChurned={w.alreadyChurned}
                        hasOpenPilot={
                          w.licenseStatus === 'trialing' &&
                          !w.stripeSubscriptionId &&
                          (w.licensePeriodEnd == null ||
                            new Date(w.licensePeriodEnd).getTime() > Date.now())
                        }
                        hasLiveStripe={Boolean(
                          w.stripeSubscriptionId && w.licenseStatus === 'active',
                        )}
                      />
                      <DeleteWorkspaceButton
                        workspaceId={w.id}
                        name={w.name}
                        slug={w.slug}
                        courseCount={w.courseCount}
                        childCount={w.childCount}
                        isDefault={w.isDefault}
                        alreadyChurned={w.alreadyChurned}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-ink-faint">
        Showing {filtered.length} of {rows.length}
      </p>
    </div>
  );
}
