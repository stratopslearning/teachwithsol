"use client";

import { useCallback, useState } from "react";

import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import BulkImportModal from "@/components/admin/BulkImportModal";
import { UserActions } from "@/components/admin/UserActions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFilteredSortedPage } from "@/hooks/useFilteredSortedPage";
import { compareStringsIgnoreCase } from "@/lib/listSort";
import {
  comparePersonsByLastName,
  formatPersonName,
} from "@/lib/personName";
import { PageControls } from "@/components/patterns/PageControls";

const ROWS_PER_PAGE = 15;

type AccessSummaryLine = {
  key: string;
  title: string;
  roles: string[];
  detail?: string;
};

type UserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  platformStaff?: boolean | null;
  accessSummary?: AccessSummaryLine[];
};

type UserSortMode = "LAST_NAME" | "FIRST_NAME" | "EMAIL" | "ACCESS";

function userCompare(a: UserRow, b: UserRow, mode: UserSortMode) {
  switch (mode) {
    case "FIRST_NAME":
      return compareStringsIgnoreCase(a.firstName ?? "", b.firstName ?? "");
    case "EMAIL":
      return compareStringsIgnoreCase(a.email ?? "", b.email ?? "");
    case "ACCESS":
      return Number(Boolean(b.platformStaff)) - Number(Boolean(a.platformStaff));
    case "LAST_NAME":
    default:
      return comparePersonsByLastName(a, b);
  }
}

export default function UserTableWithFilters({
  users,
  canGrantPlatformStaff = false,
}: {
  users: UserRow[];
  canGrantPlatformStaff?: boolean;
}) {
  const [accessFilter, setAccessFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [sortMode, setSortMode] = useState<UserSortMode>("LAST_NAME");

  const {
    page,
    setPage,
    totalPages,
    paginated: paginatedUsers,
  } = useFilteredSortedPage({
    rows: users,
    search,
    filterFn: useCallback((user: UserRow, q: string) => {
      const matchesAccess =
        accessFilter === "ALL" ||
        (accessFilter === "STAFF" && Boolean(user.platformStaff)) ||
        (accessFilter === "STANDARD" && !user.platformStaff);
      if (!q.trim()) return matchesAccess;
      const searchLower = q.toLowerCase();
      const fullName = formatPersonName(user).toLowerCase();
      const matchesSearch =
        fullName.includes(searchLower) ||
        (user.firstName?.toLowerCase().includes(searchLower) ?? false) ||
        (user.lastName?.toLowerCase().includes(searchLower) ?? false) ||
        (user.email?.toLowerCase().includes(searchLower) ?? false);
      return matchesAccess && matchesSearch;
    }, [accessFilter]),
    compareFn: useCallback(
      (a: UserRow, b: UserRow) => userCompare(a, b, sortMode),
      [sortMode],
    ),
    rowsPerPage: ROWS_PER_PAGE,
  });

  return (
    <div className="flex flex-col gap-4">
      <AdminFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or email…"
        filterValue={accessFilter}
        onFilterChange={setAccessFilter}
        filterLabel="Access"
        filterOptions={[
          { value: "ALL", label: "All accounts" },
          { value: "STAFF", label: "Platform staff" },
          { value: "STANDARD", label: "Standard" },
        ]}
        secondaryValue={sortMode}
        onSecondaryChange={(v) => setSortMode(v as UserSortMode)}
        secondaryLabel="Sort"
        secondaryOptions={[
          { value: "LAST_NAME", label: "Last name A–Z" },
          { value: "FIRST_NAME", label: "First name A–Z" },
          { value: "EMAIL", label: "Email A–Z" },
          { value: "ACCESS", label: "Platform staff first" },
        ]}
        trailing={<BulkImportModal />}
      />

      <div className="paper paper-shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {formatPersonName(user)}
                </TableCell>
                <TableCell className="text-ink-muted font-mono text-xs">
                  {user.email}
                </TableCell>
                <TableCell className="align-top">
                  <div className="min-w-[14rem] max-w-sm space-y-1.5">
                    {user.platformStaff ? (
                      <Badge variant="accent">Platform staff</Badge>
                    ) : (
                      <Badge variant="secondary">Standard</Badge>
                    )}
                    {(user.accessSummary ?? []).length === 0 ? (
                      <p className="text-xs text-ink-faint">No workspace roles</p>
                    ) : (
                      <ul className="space-y-1">
                        {(user.accessSummary ?? []).map((line) => (
                          <li key={line.key} className="text-xs leading-snug">
                            <span className="font-medium text-ink">
                              {line.title}
                            </span>
                            <span className="text-ink-muted">
                              {" · "}
                              {line.roles.join(", ")}
                              {line.detail ? ` (${line.detail})` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <UserActions
                    user={user}
                    canGrantPlatformStaff={canGrantPlatformStaff}
                  />
                </TableCell>
              </TableRow>
            ))}
            {paginatedUsers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-ink-muted py-8"
                >
                  No people found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <PageControls page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
