/**
 * Schema-correct factories for DB tests (post-0045: tenant_id + offering_id).
 * Every teaching insert defaults tenantId; makeCourse creates a default offering;
 * makeSection requires offeringId (or creates one via makeCourseWithOffering).
 *
 * Workspace create uses sol_bootstrap_workspace (FORCE RLS chicken/egg).
 * Follow-on tenant writes must run under withPinnedTenantDb / withTenantGuc.
 */
import { randomUUID } from 'crypto';
import { eq, sql } from 'drizzle-orm';

import {
  assignments,
  attempts,
  courseOfferings,
  courses,
  DEFAULT_WORKSPACE_ID,
  questions,
  quizSections,
  quizzes,
  sections,
  studentSections,
  users,
  workspaceLicenses,
  workspaceMemberships,
  workspaces,
} from '@/app/db/schema';

import type { TestDb } from './db';
import { withPinnedTenantDb } from './rlsSetup';
import { licensePlanForWorkspaceType } from '@/app/db/enums';

export const randomSlug = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

export type WorkspaceSku = 'creator' | 'business' | 'department' | 'institution';

function rowsFromExecute<T>(result: unknown): T[] {
  return (
    (result as { rows?: T[] }).rows ??
    (Array.isArray(result) ? (result as T[]) : [])
  );
}

export async function makeWorkspace(
  db: TestDb,
  overrides: Partial<typeof workspaces.$inferInsert> = {},
) {
  const type = (overrides.type ?? 'department') as WorkspaceSku;
  const id = overrides.id ?? randomUUID();
  const slug = overrides.slug ?? `ws-${randomSlug().toLowerCase()}`;
  const name = overrides.name ?? `Workspace ${randomSlug()}`;
  const status = overrides.status ?? 'active';
  const parentWorkspaceId = overrides.parentWorkspaceId ?? null;
  const settings = (overrides.settings ?? {}) as Record<string, unknown>;
  const stripeBilled = type === 'creator' || type === 'business';
  const plan = licensePlanForWorkspaceType(type);
  // Tests expect teaching-ready seats; keep active even for stripe SKUs.
  const licenseStatus = 'active';
  const billingProvider = stripeBilled ? 'stripe' : 'manual';

  await db.execute(sql`
    SELECT sol_bootstrap_workspace(
      ${id}::uuid,
      ${slug}::text,
      ${name}::text,
      ${type}::text,
      ${status}::text,
      ${parentWorkspaceId}::uuid,
      ${JSON.stringify(settings)}::jsonb,
      ${null}::uuid,
      ${plan}::text,
      ${500}::integer,
      ${1000}::integer,
      ${billingProvider}::text,
      ${licenseStatus}::text
    )
  `);

  const fetched = await db.execute(sql`
    SELECT workspace FROM sol_fetch_provisioned_workspace(${id}::uuid)
  `);
  const raw = rowsFromExecute<{ workspace: unknown }>(fetched)[0]?.workspace;
  const w =
    typeof raw === 'string'
      ? (JSON.parse(raw) as Record<string, unknown>)
      : (raw as Record<string, unknown> | null);
  if (!w?.id) {
    throw new Error('makeWorkspace: bootstrap succeeded but fetch returned null');
  }
  return {
    id: String(w.id),
    slug: String(w.slug),
    name: String(w.name),
    type: w.type as typeof workspaces.$inferSelect.type,
    status: w.status as typeof workspaces.$inferSelect.status,
    parentWorkspaceId: w.parent_workspace_id
      ? String(w.parent_workspace_id)
      : null,
    settings: (w.settings ?? {}) as typeof workspaces.$inferSelect.settings,
    createdAt: w.created_at ? new Date(String(w.created_at)) : new Date(),
    updatedAt: w.updated_at ? new Date(String(w.updated_at)) : new Date(),
  };
}

/** Seat only — writers always store role=member. */
export async function makeMembership(
  db: TestDb,
  workspaceId: string,
  userId: string,
  _legacyRoleIgnored?: string,
) {
  const [row] = await db
    .insert(workspaceMemberships)
    .values({
      workspaceId,
      userId,
      role: 'member',
      status: 'active',
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  return db.query.workspaceMemberships.findFirst({
    where: eq(workspaceMemberships.workspaceId, workspaceId),
  });
}

export async function makeLicense(
  db: TestDb,
  workspaceId: string,
  overrides: Partial<typeof workspaceLicenses.$inferInsert> = {},
) {
  // Bootstrap already inserts a license; update it when present (needs tenant GUC).
  const existing = await db.query.workspaceLicenses.findFirst({
    where: eq(workspaceLicenses.workspaceId, workspaceId),
  });
  if (existing) {
    const [row] = await db
      .update(workspaceLicenses)
      .set({
        plan: overrides.plan ?? existing.plan,
        seatCap: overrides.seatCap ?? existing.seatCap ?? 500,
        aiUnitCap: overrides.aiUnitCap ?? existing.aiUnitCap ?? 1000,
        status: overrides.status ?? existing.status,
        billingProvider: overrides.billingProvider ?? existing.billingProvider,
        periodStart: overrides.periodStart ?? existing.periodStart,
        periodEnd: overrides.periodEnd ?? existing.periodEnd,
        stripeSubscriptionId:
          overrides.stripeSubscriptionId ?? existing.stripeSubscriptionId,
      })
      .where(eq(workspaceLicenses.id, existing.id))
      .returning();
    return row!;
  }
  const [row] = await db
    .insert(workspaceLicenses)
    .values({
      workspaceId,
      plan: 'department',
      seatCap: 500,
      aiUnitCap: 1000,
      status: 'active',
      billingProvider: 'manual',
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeUser(
  db: TestDb,
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const [row] = await db
    .insert(users)
    .values({
      clerkId: `test_${randomSlug()}`,
      email: `${randomSlug()}@test.local`,
      paid: true,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeOffering(
  db: TestDb,
  courseId: string,
  opts: {
    tenantId: string;
    termLabel?: string;
    status?: typeof courseOfferings.$inferInsert.status;
  },
) {
  const termLabel = opts.termLabel?.trim() || 'default';
  const existing = await db.query.courseOfferings.findFirst({
    where: eq(courseOfferings.courseId, courseId),
  });
  if (existing && existing.termLabel === termLabel) return existing;

  const [row] = await db
    .insert(courseOfferings)
    .values({
      courseId,
      tenantId: opts.tenantId,
      termLabel,
      status: opts.status ?? 'active',
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;

  const again = await db.query.courseOfferings.findFirst({
    where: eq(courseOfferings.courseId, courseId),
  });
  if (!again) throw new Error('makeOffering failed');
  return again;
}

export async function makeCourse(
  db: TestDb,
  overrides: Partial<typeof courses.$inferInsert> = {},
) {
  let workspaceId = overrides.workspaceId;
  if (!workspaceId) {
    const ws = await makeWorkspace(db, { type: 'department' });
    await withPinnedTenantDb(db, ws.id, async (tdb) => {
      await makeLicense(tdb, ws.id);
    });
    workspaceId = ws.id;
  }
  const tenantId = overrides.tenantId ?? workspaceId;
  const insertCourse = async (tdb: TestDb) => {
    const [row] = await tdb
      .insert(courses)
      .values({
        title: `Course ${randomSlug()}`,
        ...overrides,
        workspaceId,
        tenantId,
      })
      .returning();
    return row!;
  };
  // Caller may already be inside a pinned tenant transaction.
  if (overrides.workspaceId) {
    return insertCourse(db);
  }
  return withPinnedTenantDb(db, workspaceId!, insertCourse);
}

/** Course + default offering (preferred for section creation). */
export async function makeCourseWithOffering(
  db: TestDb,
  overrides: Partial<typeof courses.$inferInsert> = {},
) {
  let workspaceId = overrides.workspaceId;
  if (!workspaceId) {
    const ws = await makeWorkspace(db, { type: 'department' });
    await withPinnedTenantDb(db, ws.id, async (tdb) => {
      await makeLicense(tdb, ws.id);
    });
    workspaceId = ws.id;
  }
  const tenantId = overrides.tenantId ?? workspaceId;
  const run = async (tdb: TestDb) => {
    const course = await makeCourse(tdb, {
      ...overrides,
      workspaceId,
      tenantId,
    });
    const offering = await makeOffering(tdb, course.id, { tenantId });
    return { course, offering, tenantId: tenantId! };
  };
  // Caller may already be inside a pinned tenant transaction.
  if (overrides.workspaceId) {
    return run(db);
  }
  return withPinnedTenantDb(db, workspaceId!, run);
}

export async function makeSection(
  db: TestDb,
  courseId: string,
  overrides: Partial<typeof sections.$inferInsert> = {},
) {
  const workspaceId = overrides.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const tenantId = overrides.tenantId ?? workspaceId;
  let offeringId = overrides.offeringId ?? null;
  if (!offeringId) {
    const offering = await makeOffering(db, courseId, { tenantId });
    offeringId = offering.id;
  }
  const [row] = await db
    .insert(sections)
    .values({
      name: `Section ${randomSlug()}`,
      professorEnrollmentCode: randomSlug(),
      studentEnrollmentCode: randomSlug(),
      ...overrides,
      courseId,
      workspaceId,
      tenantId,
      offeringId,
    })
    .returning();
  return row!;
}

export async function makeQuiz(
  db: TestDb,
  professorId: string,
  overrides: Partial<typeof quizzes.$inferInsert> = {},
) {
  let tenantId = overrides.tenantId;
  let mintedTenant = false;
  if (!tenantId) {
    // Convenience for thin integration tests: mint a disposable tenant.
    const ws = await makeWorkspace(db, { type: 'department' });
    await withPinnedTenantDb(db, ws.id, async (tdb) => {
      await makeLicense(tdb, ws.id);
    });
    tenantId = ws.id;
    mintedTenant = true;
  }
  const insertQuiz = async (tdb: TestDb) => {
    const [row] = await tdb
      .insert(quizzes)
      .values({
        title: `Quiz ${randomSlug()}`,
        maxAttempts: 1,
        passingScore: 60,
        ...overrides,
        professorId,
        tenantId,
      })
      .returning();
    return row!;
  };
  if (!mintedTenant) {
    return insertQuiz(db);
  }
  return withPinnedTenantDb(db, tenantId!, insertQuiz);
}

export async function makeQuestion(
  db: TestDb,
  quizId: string,
  overrides: Partial<typeof questions.$inferInsert> = {},
) {
  let tenantId = overrides.tenantId;
  if (!tenantId) {
    const quiz = await db.query.quizzes.findFirst({
      where: eq(quizzes.id, quizId),
      columns: { tenantId: true },
    });
    tenantId = quiz?.tenantId ?? undefined;
  }
  if (!tenantId) {
    throw new Error('makeQuestion requires tenantId (or a quiz that has one)');
  }
  const [row] = await db
    .insert(questions)
    .values({
      type: 'MULTIPLE_CHOICE',
      question: 'A?',
      options: ['a', 'b'],
      correctAnswer: 'a',
      points: 1,
      order: 0,
      ...overrides,
      quizId,
      tenantId,
    })
    .returning();
  return row!;
}

export async function enrollStudent(
  db: TestDb,
  studentId: string,
  sectionId: string,
  tenantId?: string,
) {
  const section = await db.query.sections.findFirst({
    where: eq(sections.id, sectionId),
    columns: { tenantId: true, workspaceId: true, offeringId: true },
  });
  const resolved =
    tenantId ?? section?.tenantId ?? section?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  await db
    .insert(studentSections)
    .values({
      studentId,
      sectionId,
      tenantId: resolved,
      offeringId: section?.offeringId ?? null,
    })
    .onConflictDoNothing();
}

export async function assignQuizToSection(
  db: TestDb,
  quizId: string,
  sectionId: string,
  assignedBy: string,
  tenantId?: string,
) {
  const section = await db.query.sections.findFirst({
    where: eq(sections.id, sectionId),
    columns: { tenantId: true, workspaceId: true },
  });
  const resolvedTenant =
    tenantId ?? section?.tenantId ?? section?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  await db
    .insert(quizSections)
    .values({
      quizId,
      sectionId,
      assignedBy,
      tenantId: resolvedTenant,
    })
    .onConflictDoNothing();
}

export async function makeAssignment(
  db: TestDb,
  quizId: string,
  studentId: string,
  overrides: Partial<typeof assignments.$inferInsert> = {},
) {
  let tenantId = overrides.tenantId;
  if (!tenantId) {
    const quiz = await db.query.quizzes.findFirst({
      where: eq(quizzes.id, quizId),
      columns: { tenantId: true },
    });
    tenantId = quiz?.tenantId ?? undefined;
  }
  if (!tenantId) {
    throw new Error('makeAssignment requires tenantId');
  }
  const [row] = await db
    .insert(assignments)
    .values({
      ...overrides,
      quizId,
      studentId,
      tenantId,
    })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function makeAttempt(
  db: TestDb,
  data: {
    assignmentId: string;
    studentId: string;
    quizId: string;
    sectionId: string;
    tenantId?: string;
    submittedAt?: Date;
    startedAt?: Date;
    answers?: Record<string, string>;
  },
) {
  let tenantId = data.tenantId;
  if (!tenantId) {
    const section = await db.query.sections.findFirst({
      where: eq(sections.id, data.sectionId),
      columns: { tenantId: true, workspaceId: true },
    });
    tenantId = section?.tenantId ?? section?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  }
  const [row] = await db
    .insert(attempts)
    .values({
      assignmentId: data.assignmentId,
      studentId: data.studentId,
      quizId: data.quizId,
      sectionId: data.sectionId,
      tenantId,
      answers: data.answers ?? {},
      maxScore: 1,
      startedAt: data.startedAt ?? new Date(),
      submittedAt: data.submittedAt ?? null,
    })
    .returning();
  return row!;
}
