import UserTableWithFilters from "@/components/admin/UserTableWithFilters";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  loadPeopleAccessByUserId,
  summarizePeopleAccess,
} from "@/lib/admin/peopleAccess";
import { requireAdmin } from "@/lib/auth";
import { withBasePath } from "@/lib/basePath";
import { canGrantPlatformStaff } from "@/lib/env";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { listAllUsers } from "@/lib/admin/platformReads";

export default async function AdminUsersPage() {
  await requireAdmin();
  const actor = await getOrCreateUser();
  const [allUsers, accessByUser] = await Promise.all([
    listAllUsers(),
    loadPeopleAccessByUserId(),
  ]);
  const actorCanGrant = canGrantPlatformStaff(actor?.email);

  const users = allUsers.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    platformStaff: u.platformStaff,
    accessSummary: summarizePeopleAccess(accessByUser.get(u.id) ?? []),
  }));

  return (
    <AppShell role="admin" active="users" topbarTitle="People">
      <PageHeader
        breadcrumbs={[
          { label: "Overview", href: withBasePath("/dashboard/admin") },
          { label: "People" },
        ]}
        eyebrow="People"
        title="Platform accounts"
        description="Platform staff is a SOL ops flag. Teaching and learning power comes from scoped role bindings and section enrollments."
      />
      <div className="mt-10">
        <UserTableWithFilters
          users={users}
          canGrantPlatformStaff={actorCanGrant}
        />
      </div>
    </AppShell>
  );
}
