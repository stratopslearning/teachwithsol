import { notFound } from 'next/navigation';

import { InteractiveEditForm } from '@/components/interactives/InteractiveEditForm';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { appPath, withBasePath } from '@/lib/basePath';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { assertCanManageInteractive } from '@/lib/interactives/access';
import { setInteractiveVisibility } from '@/lib/interactives/mutations';

export default async function EditInteractivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTeachingAccess();
  const { id } = await params;
  let interactive;
  try {
    interactive = await assertCanManageInteractive(user, id);
  } catch {
    return notFound();
  }

  const assignmentsHref = appPath(
    `/dashboard/professor/courses/${interactive.courseId}/assignments`,
  );

  async function toggleRelease() {
    'use server';
    const me = await getOrCreateUser();
    if (!me) return;
    const current = await assertCanManageInteractive(me, id);
    await setInteractiveVisibility(me, id, !current.isActive);
  }

  return (
    <AppShell role="professor" user={user} topbarTitle="Edit interactive">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: withBasePath('/dashboard/professor') },
          { label: 'Courses', href: withBasePath('/dashboard/professor/courses') },
          { label: 'Assignments', href: assignmentsHref },
          { label: interactive.title },
        ]}
        eyebrow={interactive.kind}
        title={interactive.title}
        description={
          interactive.isActive
            ? 'Released to students. Edits apply immediately.'
            : 'Draft — edit content, then release when ready.'
        }
        actions={
          <form action={toggleRelease}>
            <Button type="submit" variant="outline">
              {interactive.isActive ? 'Unrelease' : 'Release'}
            </Button>
          </form>
        }
      />
      <div className="mt-8">
        <InteractiveEditForm
          interactive={{
            id: interactive.id,
            title: interactive.title,
            kind: interactive.kind,
            body: interactive.body ?? {},
            courseId: interactive.courseId,
          }}
          cancelHref={assignmentsHref}
        />
      </div>
    </AppShell>
  );
}
