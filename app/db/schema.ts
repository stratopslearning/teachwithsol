import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import {
  BINDING_ROLES,
  BINDING_SCOPE_TYPES,
  LICENSE_PLANS,
  OUTLINE_ITEM_TYPES,
  PROCESSING_STATUSES,
  QUESTION_TYPES,
  SECTION_STAFF_INVITE_ROLES,
  WORKSPACE_GRANTABLE_ROLES,
  WORKSPACE_TYPES,
} from './enums';
import { relations, sql } from 'drizzle-orm';

// All timestamps are timestamptz so the database always stores/returns UTC.
// The frontend formats with the user's timezone via date-fns-tz, but the wire
// format is unambiguous.
const ts = (name: string) => timestamp(name, { withTimezone: true });

// Users table - syncs with Clerk
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkId: text('clerk_id').unique().notNull(), // Clerk's userId
    email: text('email').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    /** Platform SOL support operator; tenant data still needs support_access_grants. */
    platformStaff: boolean('platform_staff').default(false).notNull(),
    paid: boolean('paid').default(false).notNull(),
    // Stripe customer mapping for refund/dispute lookups. Nullable because
    // not every user has gone through checkout yet.
    stripeCustomerId: text('stripe_customer_id'),
    // Last time we synced this user with Clerk's source-of-truth profile.
    lastSyncedAt: ts('last_synced_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // One SOL profile per email (case-insensitive). Empty emails excluded so
    // rare Clerk-profile fetch failures don't collide on ''.
    emailLowerUnique: uniqueIndex('users_email_lower_unique')
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} <> ''`),
  }),
);

/**
 * Tenant for Creator / Business / Department / Institution SKUs.
 * See docs/architecture/scale-and-tenancy.md.
 */
export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    type: text('type', {
      enum: WORKSPACE_TYPES,
    })
      .default('department')
      .notNull(),
    status: text('status', {
      enum: ['trial', 'active', 'suspended', 'churned'],
    })
      .default('active')
      .notNull(),
    parentWorkspaceId: uuid('parent_workspace_id').references(
      (): any => workspaces.id,
      { onDelete: 'set null' },
    ),
    settings: jsonb('settings').$type<Record<string, unknown>>(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex('workspaces_slug_unique').on(t.slug),
    parentIdx: index('workspaces_parent_idx').on(t.parentWorkspaceId),
  }),
);

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    /**
     * Seat-only since 0043: writers only ever store 'member'. Legacy values
     * (owner/admin/instructor/learner) remain in the enum for the expand
     * window only and carry NO authority — power comes from role_bindings.
     * PLANNED CONTRACT: drop this column once no reader references it
     * (tracked in docs/GATE_2_REPORT.md).
     */
    role: text('role', {
      enum: ['member', 'owner', 'admin', 'instructor', 'learner'],
    })
      .default('member')
      .notNull(),
    status: text('status', {
      enum: ['active', 'invited', 'removed'],
    })
      .default('active')
      .notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    workspaceUserUnique: uniqueIndex('workspace_memberships_workspace_user_unique').on(
      t.workspaceId,
      t.userId,
    ),
    userIdx: index('workspace_memberships_user_idx').on(t.userId),
    workspaceIdx: index('workspace_memberships_workspace_idx').on(t.workspaceId),
  }),
);

export const workspaceLicenses = pgTable(
  'workspace_licenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    plan: text('plan', {
      enum: LICENSE_PLANS,
    })
      .default('department')
      .notNull(),
    seatCap: integer('seat_cap').default(500).notNull(),
    aiUnitCap: integer('ai_unit_cap'),
    periodStart: ts('period_start'),
    periodEnd: ts('period_end'),
    billingProvider: text('billing_provider', {
      enum: ['manual', 'stripe'],
    })
      .default('manual')
      .notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status', {
      enum: ['trialing', 'active', 'past_due', 'canceled'],
    })
      .default('active')
      .notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    workspaceIdx: index('workspace_licenses_workspace_idx').on(t.workspaceId),
  }),
);

/** Daily AI usage rollup per workspace (grades, tutor turns, embeds). */
export const workspaceUsageDaily = pgTable(
  'workspace_usage_daily',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    day: text('day').notNull(), // YYYY-MM-DD UTC
    gradeUnits: integer('grade_units').default(0).notNull(),
    tutorUnits: integer('tutor_units').default(0).notNull(),
    embedUnits: integer('embed_units').default(0).notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    workspaceDayUnique: uniqueIndex('workspace_usage_daily_workspace_day_unique').on(
      t.workspaceId,
      t.day,
    ),
    workspaceIdx: index('workspace_usage_daily_workspace_idx').on(t.workspaceId),
  }),
);

/**
 * One-time claim links for workspace owners (admin provisions, client claims).
 * Plain token is shown once; only the SHA-256 hash is stored.
 */
export const workspaceInvites = pgTable(
  'workspace_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    email: text('email').notNull(),
    role: text('role', {
      enum: ['owner', 'admin', 'instructor'],
    })
      .default('owner')
      .notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    claimedAt: ts('claimed_at'),
    claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('workspace_invites_token_hash_unique').on(
      t.tokenHash,
    ),
    workspaceIdx: index('workspace_invites_workspace_idx').on(t.workspaceId),
    emailIdx: index('workspace_invites_email_idx').on(t.email),
  }),
);

/**
 * Scoped role bindings — sole source of staff/admin power inside a tenant.
 * Membership seats carry no authority. Students use student_sections.
 */
export const roleBindings = pgTable(
  'role_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    scopeType: text('scope_type', {
      enum: BINDING_SCOPE_TYPES,
    }).notNull(),
    scopeId: uuid('scope_id').notNull(),
    role: text('role', {
      enum: BINDING_ROLES,
    }).notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').defaultNow().notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => ({
    tenantUserIdx: index('role_bindings_tenant_user_idx').on(t.tenantId, t.userId),
    scopeIdx: index('role_bindings_scope_idx').on(t.scopeType, t.scopeId),
    activeUnique: uniqueIndex('role_bindings_active_scope_role_uidx')
      .on(t.tenantId, t.userId, t.scopeType, t.scopeId, t.role)
      .where(sql`${t.revokedAt} IS NULL`),
    // 0043: one active role per (user, scope). CHECK role_bindings_role_scope_check
    // (role, scope_type) pairs lives in SQL only; see lib/authz/permissions.ts ROLE_SCOPE_PAIRS.
    activeUserScopeUnique: uniqueIndex('role_bindings_active_user_scope_uidx')
      .on(t.userId, t.scopeType, t.scopeId)
      .where(sql`${t.revokedAt} IS NULL`),
  }),
);

/** @deprecated Use roleBindings — alias kept for gradual import migration. */
export const grants = roleBindings;

/** Time-limited platform support access to tenant data (replaces ADMIN bypass). */
export const supportAccessGrants = pgTable(
  'support_access_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    grantedBy: uuid('granted_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    expiresAt: ts('expires_at').notNull(),
    reason: text('reason').notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => ({
    userTenantIdx: index('support_access_grants_user_tenant_idx').on(
      t.userId,
      t.tenantId,
    ),
    expiresIdx: index('support_access_grants_expires_idx').on(t.expiresAt),
  }),
);

/** Stable id for the backfilled default workspace (local/dev + existing data). */
export const DEFAULT_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';

// Courses table - Admin creates courses (no professor assignment at course level)
export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description'),
    /** Discipline label for AI prompts (e.g. Biology, Accounting). */
    subject: text('subject').notNull().default('General'),
    /** Level label for AI prompts (e.g. undergraduate, graduate). */
    level: text('level').notNull().default('undergraduate'),
    /** Feedback tone for grader/tutor prompts (e.g. supportive, direct). */
    feedbackTone: text('feedback_tone').notNull().default('supportive'),
    /** Course-default tutor policy `{ mode: 'hints'|'guided'|'full_after_submit' }`. */
    aiPolicy: jsonb('ai_policy').$type<{
      mode: 'hints' | 'guided' | 'full_after_submit';
    }>(),
    /**
     * Canvas-like course tool order/visibility:
     * `{ tools: [{ id, hidden? }] }`.
     */
    lmsNavigation: jsonb('lms_navigation').$type<{
      tools: Array<{ id: string; hidden?: boolean }>;
    }>(),
    /** Rich syllabus body (markdown/HTML). */
    syllabusMarkdown: text('syllabus_markdown'),
    status: text('status', { enum: ['ACTIVE', 'INACTIVE'] })
      .default('ACTIVE')
      .notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    // Soft-delete tombstone. Mutating queries set this; reads filter on it.
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    workspaceIdx: index('courses_workspace_idx').on(t.workspaceId),
    tenantIdx: index('courses_tenant_idx').on(t.tenantId),
  }),
);

/** Course term / offering (default offering backfilled for every course). */
export const courseOfferings = pgTable(
  'course_offerings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    /** Product tenant key — FK to workspaces.id. */
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    termLabel: text('term_label').default('default').notNull(),
    status: text('status', {
      enum: ['draft', 'active', 'ended', 'archived'],
    })
      .default('active')
      .notNull(),
    startsAt: ts('starts_at'),
    endsAt: ts('ends_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    courseTermUnique: uniqueIndex('course_offerings_course_term_uidx').on(
      t.courseId,
      t.termLabel,
    ),
    tenantIdx: index('course_offerings_tenant_idx').on(t.tenantId),
    courseIdx: index('course_offerings_course_idx').on(t.courseId),
  }),
);

// Sections table - Admin creates sections within courses
export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    /** Denormalized from courses.workspace_id for per-workspace enrollment codes. */
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    name: text('name').notNull(), // e.g., "Section A", "Morning Section"
    professorEnrollmentCode: text('professor_enrollment_code').notNull(), // 6-character code for professors
    studentEnrollmentCode: text('student_enrollment_code').notNull(), // 6-character code for students
    isActive: boolean('is_active').default(true).notNull(),
    /** When set and now > endsAt, section is concluded for students (Canvas-style). */
    endsAt: ts('ends_at'),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    courseIdx: index('sections_course_idx').on(table.courseId),
    offeringIdx: index('sections_offering_idx').on(table.offeringId),
    workspaceIdx: index('sections_workspace_idx').on(table.workspaceId),
    workspaceProfessorCodeUidx: uniqueIndex(
      'sections_workspace_prof_enrollment_code_uidx',
    ).on(table.workspaceId, table.professorEnrollmentCode),
    workspaceStudentCodeUidx: uniqueIndex(
      'sections_workspace_stud_enrollment_code_uidx',
    ).on(table.workspaceId, table.studentEnrollmentCode),
  }),
);

/** Email-bound instructor / TA / grader invites (claim before or after account exists). */
export const sectionStaffInvites = pgTable(
  'section_staff_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    email: text('email').notNull(),
    role: text('role', {
      enum: SECTION_STAFF_INVITE_ROLES,
    }).notNull(),
    tokenHash: text('token_hash').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: ts('expires_at').notNull(),
    claimedAt: ts('claimed_at'),
    claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('section_staff_invites_token_hash_unique').on(
      t.tokenHash,
    ),
    sectionIdx: index('section_staff_invites_section_idx').on(t.sectionId),
  }),
);

/** Email-bound student section invites (claim enrolls into the section). */
export const sectionStudentInvites = pgTable(
  'section_student_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: ts('expires_at').notNull(),
    claimedAt: ts('claimed_at'),
    claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('section_student_invites_token_hash_unique').on(
      t.tokenHash,
    ),
    sectionIdx: index('section_student_invites_section_idx').on(t.sectionId),
    emailIdx: index('section_student_invites_email_idx').on(t.email),
  }),
);

/**
 * Dedupe transactional ops emails (e.g. AI-cap alerts once per UTC day).
 */
export const emailNotifications = pgTable(
  'email_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    kind: text('kind', {
      enum: ['ai_cap', 'access_request_digest'],
    }).notNull(),
    /** Bucket key, e.g. YYYY-MM-DD UTC for daily dedupe. */
    periodKey: text('period_key').notNull(),
    sentAt: ts('sent_at').defaultNow().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => ({
    workspaceKindPeriodUnique: uniqueIndex(
      'email_notifications_workspace_kind_period_uidx',
    ).on(t.workspaceId, t.kind, t.periodKey),
  }),
);

/** People requesting faculty/admin access to a workspace. */
export const workspaceAccessRequests = pgTable(
  'workspace_access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    email: text('email').notNull(),
    name: text('name'),
    claimedRole: text('claimed_role', {
      enum: WORKSPACE_GRANTABLE_ROLES,
    })
      .default('instructor')
      .notNull(),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected', 'blocked'],
    })
      .default('pending')
      .notNull(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedBy: uuid('decided_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: ts('decided_at'),
    note: text('note'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    workspaceIdx: index('workspace_access_requests_workspace_idx').on(
      t.workspaceId,
    ),
    statusIdx: index('workspace_access_requests_status_idx').on(t.status),
    emailIdx: index('workspace_access_requests_email_idx').on(t.email),
  }),
);

// Professor-Section enrollments - professors enroll in sections using codes
export const professorSections = pgTable(
  'professor_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    professorId: uuid('professor_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    enrolledAt: ts('enrolled_at').defaultNow().notNull(),
    status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).default('ACTIVE').notNull(),
  },
  (table) => ({
    // One enrollment per (professor, section): prevents duplicate joins.
    professorSectionUnique: uniqueIndex('professor_sections_unique').on(
      table.professorId,
      table.sectionId,
    ),
    sectionIdx: index('professor_sections_section_idx').on(table.sectionId),
  }),
);

// Student-Section enrollments - students enroll in sections using codes
export const studentSections = pgTable(
  'student_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    enrolledAt: ts('enrolled_at').defaultNow().notNull(),
    status: text('status', { enum: ['ACTIVE', 'DROPPED'] }).default('ACTIVE').notNull(),
    /** How this enrollment was established: lti, code, csv, invite (multi-source idempotent). */
    sources: jsonb('sources')
      .$type<Array<'lti' | 'code' | 'csv' | 'invite'>>()
      .default([])
      .notNull(),
  },
  (table) => ({
    studentSectionUnique: uniqueIndex('student_sections_unique').on(
      table.studentId,
      table.sectionId,
    ),
    sectionIdx: index('student_sections_section_idx').on(table.sectionId),
  }),
);

/**
 * Offering-level enrollment (0046). Dual-written with student_sections by
 * lib/enrollment/sources.ts; readers still use student_sections during expand.
 */
export const studentOfferings = pgTable(
  'student_offerings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    offeringId: uuid('offering_id')
      .references(() => courseOfferings.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status', { enum: ['ACTIVE', 'DROPPED'] })
      .default('ACTIVE')
      .notNull(),
    sources: jsonb('sources')
      .$type<Array<'lti' | 'code' | 'csv' | 'invite'>>()
      .default([])
      .notNull(),
    enrolledAt: ts('enrolled_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    studentOfferingUnique: uniqueIndex(
      'student_offerings_student_offering_uidx',
    ).on(t.studentId, t.offeringId),
    tenantIdx: index('student_offerings_tenant_idx').on(t.tenantId),
  }),
);

/** Cross-listed / merged section aliases (non-LTI canvas link table). */
export const sectionLinks = pgTable(
  'section_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    solSectionId: uuid('sol_section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    externalKind: text('external_kind', { enum: ['lti', 'alias'] }).notNull(),
    externalId: text('external_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    tenantKindExternalUnique: uniqueIndex(
      'section_links_tenant_kind_external_uidx',
    ).on(t.tenantId, t.externalKind, t.externalId),
    sectionIdx: index('section_links_section_idx').on(t.solSectionId),
  }),
);

// Quizzes table - professors create and own quizzes
export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    professorId: uuid('professor_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(), // Professor who created the quiz
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    maxAttempts: integer('max_attempts').default(1).notNull(), // Maximum attempts allowed
    timeLimit: integer('time_limit'), // in minutes
    // Percentage threshold (0-100) for `attempts.passed`. Default 60.
    passingScore: integer('passing_score').default(60).notNull(),
    startDate: ts('start_date'), // Quiz start date
    endDate: ts('end_date'), // Quiz end date
    isActive: boolean('is_active').default(true).notNull(),
    /** Students don't see per-question feedback until the quiz closes. */
    hideFeedbackAfterDue: boolean('hide_feedback_after_due').default(false).notNull(),
    /** When set, students may see released scores and override history. */
    gradesReleasedAt: ts('grades_released_at'),
    /** Set when created from Authoring QUIZ publish. */
    sourceOutlineItemId: uuid('source_outline_item_id'),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    professorIdx: index('quizzes_professor_idx').on(table.professorId),
  }),
);

// Quiz-Section assignments - quizzes assigned to sections
export const quizSections = pgTable(
  'quiz_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    assignedBy: uuid('assigned_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(), // who assigned (professor or admin)
    assignedAt: ts('assigned_at').defaultNow().notNull(),
  },
  (table) => ({
    quizSectionUnique: uniqueIndex('quiz_sections_unique').on(
      table.quizId,
      table.sectionId,
    ),
    sectionIdx: index('quiz_sections_section_idx').on(table.sectionId),
  }),
);

// Questions table
export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    type: text('type', { enum: QUESTION_TYPES }).notNull(),
    question: text('question').notNull(),
    options: jsonb('options'), // For MCQ: ["option1", "option2", ...]
    correctAnswer: text('correct_answer'), // For MCQ/TF: "option1" or "true"
    points: integer('points').default(1).notNull(),
    order: integer('order').notNull(),
    // Rubric for SHORT_ANSWER (`RubricCriterion[]`). Prefer authored+approved;
    // derive-at-grade is fallback-only.
    rubric: jsonb('rubric'),
    // Bumped whenever the question text or reference answer changes; used as a
    // cache-invalidation token for `grading_cache` lookups.
    rubricVersion: integer('rubric_version').default(1).notNull(),
    /** none | proposed | approved | rejected */
    rubricStatus: text('rubric_status').notNull().default('none'),
    rubricApprovedAt: ts('rubric_approved_at'),
    rubricApprovedBy: uuid('rubric_approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Short concept labels for Analytics (from Authoring generate/publish). */
    conceptTags: jsonb('concept_tags').$type<string[]>().notNull().default([]),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    quizIdx: index('questions_quiz_idx').on(table.quizId),
  }),
);

/** Immutable quiz snapshots for attempt versioning (additive). */
export const quizVersions = pgTable(
  'quiz_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    quizVersionUnique: uniqueIndex('quiz_versions_quiz_version_uidx').on(
      table.quizId,
      table.version,
    ),
    quizIdx: index('quiz_versions_quiz_idx').on(table.quizId),
    tenantIdx: index('quiz_versions_tenant_idx').on(table.tenantId),
  }),
);

// Assignments table - links students to quizzes
export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    dueDate: ts('due_date'),
    isCompleted: boolean('is_completed').default(false).notNull(),
    assignedAt: ts('assigned_at').defaultNow().notNull(),
    completedAt: ts('completed_at'),
  },
  (table) => ({
    // One assignment per (quiz, student). Prevents the duplicate-assignment
    // bug where a student would otherwise see N copies of the same quiz.
    quizStudentUnique: uniqueIndex('assignments_quiz_student_unique').on(
      table.quizId,
      table.studentId,
    ),
    studentIdx: index('assignments_student_idx').on(table.studentId),
  }),
);

// Attempts table - student quiz submissions
export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(), // Track which section context
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    quizVersionId: uuid('quiz_version_id').references(() => quizVersions.id, {
      onDelete: 'set null',
    }),
    answers: jsonb('answers').notNull(), // { questionId: answer }
    score: integer('score'), // total points earned
    maxScore: integer('max_score').notNull(), // total possible points
    percentage: integer('percentage'), // score as percentage
    passed: boolean('passed'), // based on passing score
    gptFeedback: jsonb('gpt_feedback'), // AI feedback for short answers
    // 'complete' = everything graded. 'partial' = at least one short-answer
    // question is still `pending` inside gpt_feedback; the background cron
    // worker will retry it. 'failed' = grading is stuck after retries and
    // requires professor manual_review.
    gradingStatus: text('grading_status', {
      enum: ['complete', 'partial', 'failed'],
    }),
    startedAt: ts('started_at').defaultNow().notNull(),
    submittedAt: ts('submitted_at'),
  },
  (table) => ({
    assignmentIdx: index('attempts_assignment_idx').on(table.assignmentId),
    studentIdx: index('attempts_student_idx').on(table.studentId),
    quizIdx: index('attempts_quiz_idx').on(table.quizId),
    sectionIdx: index('attempts_section_idx').on(table.sectionId),
    // Partial / composite indexes live in SQL migrations (Drizzle cannot
    // express all predicates cleanly):
    // - attempts_grading_status_idx (0005): WHERE grading_status IS NOT NULL AND <> 'complete'
    // - attempts_one_open_per_assignment_idx (0007): UNIQUE(assignment_id) WHERE submitted_at IS NULL
    // - attempts_section_quiz_submitted_idx (0019): (section_id, quiz_id, submitted_at DESC) WHERE submitted
  }),
);

/** Instructor manual score adjustments; original AI grading stays on the attempt. */
export const gradeOverrides = pgTable(
  'grade_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .references(() => attempts.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: uuid('question_id').references(() => questions.id, {
      onDelete: 'cascade',
    }),
    numericScore: integer('numeric_score'),
    criteriaOverrides: jsonb('criteria_overrides').$type<
      Record<string, boolean>
    >(),
    note: text('note').notNull(),
    actorUserId: uuid('actor_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    attemptIdx: index('grade_overrides_attempt_idx').on(table.attemptId),
    attemptCreatedIdx: index('grade_overrides_attempt_created_idx').on(
      table.attemptId,
      table.createdAt,
    ),
    tenantIdx: index('grade_overrides_tenant_idx').on(table.tenantId),
  }),
);

/** Labeled instructor overrides for few-shot grading (tenant + question scoped). */
export const gradingOverrideExamples = pgTable(
  'grading_override_examples',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: uuid('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    rubricVersion: integer('rubric_version').notNull().default(1),
    studentAnswerSnippet: text('student_answer_snippet').notNull(),
    aiMatches: jsonb('ai_matches'),
    instructorCriteria: jsonb('instructor_criteria').$type<
      Record<string, boolean>
    >(),
    instructorScore: integer('instructor_score'),
    note: text('note'),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    qIdx: index('grading_override_examples_q_idx').on(
      table.tenantId,
      table.questionId,
      table.rubricVersion,
    ),
  }),
);

/** OpenAI Batch API jobs for bulk regrades. */
export const gradingBatches = pgTable(
  'grading_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    openaiBatchId: text('openai_batch_id'),
    status: text('status').notNull().default('pending'),
    attemptIds: jsonb('attempt_ids').$type<string[]>().notNull().default([]),
    requestCount: integer('request_count').notNull().default(0),
    resultSummary: jsonb('result_summary'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('grading_batches_tenant_idx').on(
      table.tenantId,
      table.createdAt,
    ),
  }),
);

/** End-of-unit misconception clusters + authoring suggestions. */
export const unitInsights = pgTable(
  'unit_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    /** FK enforced in SQL migration; plain uuid here to avoid schema order issues. */
    outlineId: uuid('outline_id'),
    moduleId: uuid('module_id'),
    misconceptions: jsonb('misconceptions')
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    suggestions: jsonb('suggestions')
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    modelVersion: text('model_version'),
    promptVersion: text('prompt_version'),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    courseIdx: index('unit_insights_course_idx').on(
      table.tenantId,
      table.courseId,
      table.createdAt,
    ),
  }),
);

// Deterministic answer cache. SHA-256 hash of
// (questionId + normalized answer + rubricVersion + modelVersion) → previously
// computed grading payload. Lets "same answer same grade" hold even across
// resubmissions, and short-circuits OpenAI for re-grades.
export const gradingCache = pgTable(
  'grading_cache',
  {
    key: text('key').primaryKey(),
    questionId: uuid('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    rubricVersion: integer('rubric_version').notNull(),
    modelVersion: text('model_version').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    questionIdx: index('grading_cache_question_idx').on(table.questionId),
  }),
);

// Stripe webhook events: used for idempotency. Recording the event id with a
// unique constraint guarantees we only act on each Stripe event once, even if
// Stripe retries delivery.
export const stripeEvents = pgTable('stripe_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: text('event_id').unique().notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: ts('received_at').defaultNow().notNull(),
  processedAt: ts('processed_at'),
});

// Clerk webhook events: same idempotency pattern (svix-id is stable across retries).
export const clerkEvents = pgTable('clerk_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: text('event_id').unique().notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: ts('received_at').defaultNow().notNull(),
  processedAt: ts('processed_at'),
});

// Audit log of administrative + sensitive actions. Append-only; a Postgres
// trigger (drizzle/0011_audit_log_append_only.sql) rejects UPDATE/DELETE.
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorClerkId: text('actor_clerk_id'),
    action: text('action').notNull(), // e.g. 'admin.user.delete'
    targetType: text('target_type'), // e.g. 'user' | 'quiz' | 'course'
    targetId: text('target_id'),
    metadata: jsonb('metadata'),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index('audit_log_created_idx').on(table.createdAt),
    actorIdx: index('audit_log_actor_idx').on(table.actorUserId),
    tenantCreatedIdx: index('audit_log_tenant_created_idx').on(
      table.tenantId,
      table.createdAt,
    ),
  }),
);

/** Precomputed analytics payloads (criterion miss rates, etc.). */
export const analyticsRollups = pgTable(
  'analytics_rollups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'cascade',
    }),
    sectionId: uuid('section_id').references(() => sections.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    computedAt: ts('computed_at').defaultNow().notNull(),
  },
  (table) => ({
    scopeKindUnique: uniqueIndex('analytics_rollups_scope_kind_uidx').on(
      table.tenantId,
      table.offeringId,
      table.sectionId,
      table.kind,
    ),
    tenantKindIdx: index('analytics_rollups_tenant_kind_idx').on(
      table.tenantId,
      table.kind,
      table.computedAt,
    ),
  }),
);

/** Student-initiated regrade requests (professor attention queue). */
export const regradeRequests = pgTable(
  'regrade_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .references(() => attempts.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    note: text('note').notNull(),
    status: text('status', { enum: ['open', 'resolved'] })
      .default('open')
      .notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    resolvedAt: ts('resolved_at'),
  },
  (table) => ({
    statusIdx: index('regrade_requests_status_idx').on(
      table.status,
      table.createdAt,
    ),
    attemptIdx: index('regrade_requests_attempt_idx').on(table.attemptId),
    tenantIdx: index('regrade_requests_tenant_idx').on(table.tenantId),
  }),
);

/**
 * Personal access tokens for the professor API / MCP server.
 *
 * Only a SHA-256 hash of the secret is stored; the plaintext (`sol_pat_…`) is
 * shown exactly once at mint time. `scopes` gates which tool families a token
 * may call (see `lib/professor/apiTokens.ts`). Revocation is a tombstone so the
 * audit trail keeps the row.
 */
export const professorApiTokens = pgTable(
  'professor_api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').unique().notNull(),
    // First characters of the plaintext token, for display ("sol_pat_ab12…").
    prefix: text('prefix').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    lastUsedAt: ts('last_used_at'),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('professor_api_tokens_user_idx').on(table.userId),
    tenantIdx: index('professor_api_tokens_tenant_idx').on(table.tenantId),
  }),
);

// Socratic discussion chatbots: professor-authored (or seeded templates).
export const chatbots = pgTable(
  'chatbots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Nullable for system templates (`isTemplate = true`) that any professor
    // can duplicate into an owned copy before assigning.
    professorId: uuid('professor_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    personaName: text('persona_name').notNull().default('Professor Emma'),
    instructions: text('instructions').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    relatedQuizId: uuid('related_quiz_id').references(() => quizzes.id, {
      onDelete: 'set null',
    }),
    isTemplate: boolean('is_template').default(false).notNull(),
    model: text('model').notNull().default('gpt-4.1-mini'),
    aiPolicy: jsonb('ai_policy').$type<{
      mode: 'hints' | 'guided' | 'full_after_submit';
    }>(),
    isActive: boolean('is_active').default(true).notNull(),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    professorIdx: index('chatbots_professor_idx').on(table.professorId),
    relatedQuizIdx: index('chatbots_related_quiz_idx').on(table.relatedQuizId),
  }),
);

export const chatbotSections = pgTable(
  'chatbot_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatbotId: uuid('chatbot_id')
      .references(() => chatbots.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    assignedBy: uuid('assigned_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    assignedAt: ts('assigned_at').defaultNow().notNull(),
  },
  (table) => ({
    chatbotSectionUnique: uniqueIndex('chatbot_sections_unique').on(
      table.chatbotId,
      table.sectionId,
    ),
    sectionIdx: index('chatbot_sections_section_idx').on(table.sectionId),
  }),
);

export const chatbotAssignments = pgTable(
  'chatbot_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatbotId: uuid('chatbot_id')
      .references(() => chatbots.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    isCompleted: boolean('is_completed').default(false).notNull(),
    assignedAt: ts('assigned_at').defaultNow().notNull(),
    completedAt: ts('completed_at'),
  },
  (table) => ({
    chatbotStudentUnique: uniqueIndex('chatbot_assignments_unique').on(
      table.chatbotId,
      table.studentId,
    ),
    studentIdx: index('chatbot_assignments_student_idx').on(table.studentId),
  }),
);

export type ChatbotMessage = {
  role: 'user' | 'assistant';
  content: string;
  at: string;
};

/** Course-scoped Knowledge library: originals in S3, chunks+embeddings in Neon. */
export const courseMaterials = pgTable(
  'course_materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    uploadedByUserId: uuid('uploaded_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    sourceType: text('source_type', { enum: ['UPLOAD', 'URL'] }).notNull(),
    mimeType: text('mime_type'),
    byteSize: integer('byte_size'),
    /** Private S3 object key for UPLOAD sources. */
    s3Key: text('s3_key'),
    /** Original URL for URL sources. */
    externalUrl: text('external_url'),
    status: text('status', {
      enum: PROCESSING_STATUSES,
    })
      .default('PENDING')
      .notNull(),
    errorMessage: text('error_message'),
    /**
     * Authoring corpus tag: prior_course drives faithful structure/assignment mimic;
     * this_term grounds updates and gaps.
     */
    authoringCorpus: text('authoring_corpus', {
      enum: ['prior_course', 'this_term'],
    })
      .default('this_term')
      .notNull(),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    courseIdx: index('course_materials_course_idx').on(table.courseId),
    courseStatusIdx: index('course_materials_course_status_idx').on(
      table.courseId,
      table.status,
    ),
  }),
);

/** OpenAI text-embedding-3-small dimensions. */
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

export const courseMaterialChunks = pgTable(
  'course_material_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    materialId: uuid('material_id')
      .references(() => courseMaterials.id, { onDelete: 'cascade' })
      .notNull(),
    /** Denormalized for course-scoped retrieval without a join. */
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenCount: integer('token_count'),
    embedding: vector('embedding', {
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    }),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    materialIdx: index('course_material_chunks_material_idx').on(
      table.materialId,
    ),
    courseIdx: index('course_material_chunks_course_idx').on(table.courseId),
    // course_material_chunks_embedding_hnsw_idx (0020): HNSW cosine WHERE active
  }),
);

/** Workspace-scoped connector accounts (Drive, OneDrive, Notion, …). */
export const knowledgeConnectors = pgTable(
  'knowledge_connectors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider', {
      enum: [
        'google_drive',
        'onedrive',
        'sharepoint',
        'notion',
        'confluence',
      ],
    }).notNull(),
    status: text('status', {
      enum: ['disconnected', 'connected', 'error', 'syncing'],
    })
      .default('disconnected')
      .notNull(),
    displayName: text('display_name'),
    encryptedTokens: text('encrypted_tokens'),
    scopes: text('scopes'),
    config: jsonb('config').$type<Record<string, unknown>>().default({}),
    lastSyncAt: ts('last_sync_at'),
    errorMessage: text('error_message'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index('knowledge_connectors_workspace_idx').on(
      table.workspaceId,
    ),
    tenantIdx: index('knowledge_connectors_tenant_idx').on(table.tenantId),
  }),
);

/** Shared Knowledge library document (workspace-owned). */
export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    sourceKind: text('source_kind', {
      enum: ['UPLOAD', 'URL', 'CONNECTOR'],
    }).notNull(),
    mimeType: text('mime_type'),
    byteSize: integer('byte_size'),
    externalUrl: text('external_url'),
    connectorId: uuid('connector_id').references(() => knowledgeConnectors.id, {
      onDelete: 'set null',
    }),
    externalId: text('external_id'),
    externalPath: text('external_path'),
    status: text('status', {
      enum: PROCESSING_STATUSES,
    })
      .default('PENDING')
      .notNull(),
    errorMessage: text('error_message'),
    /**
     * personal = only creator (+ workspace coordinators);
     * workspace = shared library for faculty.
     */
    visibility: text('visibility', {
      enum: ['personal', 'workspace'],
    })
      .default('workspace')
      .notNull(),
    /** Active version for RAG; FK added in SQL migration. */
    currentVersionId: uuid('current_version_id'),
    legacyMaterialId: uuid('legacy_material_id').references(
      () => courseMaterials.id,
      { onDelete: 'set null' },
    ),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index('knowledge_documents_workspace_idx').on(
      table.workspaceId,
    ),
    tenantIdx: index('knowledge_documents_tenant_idx').on(table.tenantId),
    workspaceStatusIdx: index('knowledge_documents_workspace_status_idx').on(
      table.workspaceId,
      table.status,
    ),
  }),
);

export const knowledgeDocumentVersions = pgTable(
  'knowledge_document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    version: integer('version').notNull(),
    s3Key: text('s3_key'),
    checksum: text('checksum'),
    byteSize: integer('byte_size'),
    mimeType: text('mime_type'),
    ocrUsed: boolean('ocr_used').default(false).notNull(),
    charCount: integer('char_count'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    documentIdx: index('knowledge_document_versions_document_idx').on(
      table.documentId,
    ),
    tenantIdx: index('knowledge_document_versions_tenant_idx').on(table.tenantId),
  }),
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' })
      .notNull(),
    versionId: uuid('version_id')
      .references(() => knowledgeDocumentVersions.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenCount: integer('token_count'),
    embedding: vector('embedding', {
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    }),
    supersededAt: ts('superseded_at'),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    documentIdx: index('knowledge_chunks_document_idx').on(table.documentId),
    versionIdx: index('knowledge_chunks_version_idx').on(table.versionId),
    workspaceIdx: index('knowledge_chunks_workspace_idx').on(table.workspaceId),
    tenantIdx: index('knowledge_chunks_tenant_idx').on(table.tenantId),
  }),
);

/** Attach a workspace document to a course for RAG. */
export const courseKnowledgeLinks = pgTable(
  'course_knowledge_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: uuid('document_id')
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    linkedByUserId: uuid('linked_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /**
     * Version this course uses for RAG. New library versions set
     * updateAvailableVersionId; faculty must opt in to advance the pin.
     */
    pinnedVersionId: uuid('pinned_version_id').references(
      () => knowledgeDocumentVersions.id,
      { onDelete: 'set null' },
    ),
    updateAvailableVersionId: uuid('update_available_version_id').references(
      () => knowledgeDocumentVersions.id,
      { onDelete: 'set null' },
    ),
    updateNoticedAt: ts('update_noticed_at'),
    /** Same corpus tag as course_materials for authoring retrieval weighting. */
    authoringCorpus: text('authoring_corpus', {
      enum: ['prior_course', 'this_term'],
    })
      .default('this_term')
      .notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    courseIdx: index('course_knowledge_links_course_idx').on(table.courseId),
    documentIdx: index('course_knowledge_links_document_idx').on(
      table.documentId,
    ),
    pinnedVersionIdx: index('course_knowledge_links_pinned_version_idx').on(
      table.pinnedVersionId,
    ),
  }),
);

export const knowledgeSyncRuns = pgTable(
  'knowledge_sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectorId: uuid('connector_id')
      .references(() => knowledgeConnectors.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status', {
      enum: ['running', 'succeeded', 'failed'],
    })
      .default('running')
      .notNull(),
    startedAt: ts('started_at').defaultNow().notNull(),
    finishedAt: ts('finished_at'),
    createdCount: integer('created_count').default(0).notNull(),
    updatedCount: integer('updated_count').default(0).notNull(),
    skippedCount: integer('skipped_count').default(0).notNull(),
    errorCount: integer('error_count').default(0).notNull(),
    errorMessage: text('error_message'),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
  },
  (table) => ({
    connectorIdx: index('knowledge_sync_runs_connector_idx').on(
      table.connectorId,
    ),
    tenantIdx: index('knowledge_sync_runs_tenant_idx').on(table.tenantId),
  }),
);

/**
 * Hosted course books (Pressbooks webbook crawl, EPUB, Pressbooks XML, or PDF).
 * Chapters are student-readable; also indexed into course_materials for RAG.
 */
export const hostedBooks = pgTable(
  'hosted_books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    sourceKind: text('source_kind', {
      enum: ['WEBBOOK_URL', 'EPUB', 'PRESSBOOKS_XML', 'PDF'],
    }).notNull(),
    sourceUrl: text('source_url'),
    s3Key: text('s3_key'),
    status: text('status', {
      enum: PROCESSING_STATUSES,
    })
      .default('PENDING')
      .notNull(),
    errorMessage: text('error_message'),
    isReleased: boolean('is_released').default(false).notNull(),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    courseIdx: index('hosted_books_course_idx').on(table.courseId),
    courseStatusIdx: index('hosted_books_course_status_idx').on(
      table.courseId,
      table.status,
    ),
  }),
);

export const bookChapters = pgTable(
  'book_chapters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookId: uuid('book_id')
      .references(() => hostedBooks.id, { onDelete: 'cascade' })
      .notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    /** Self-FK: null = top-level chapter; set = sub-chapter under parent. */
    parentId: uuid('parent_id').references((): any => bookChapters.id, {
      onDelete: 'cascade',
    }),
    /** 0 = chapter, 1+ = nested sub-chapter (capped in parsers). */
    level: integer('level').notNull().default(0),
    position: integer('position').notNull().default(0),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    /** Optional Pressbooks “part” label (legacy grouping; prefer parentId). */
    partTitle: text('part_title'),
    markdown: text('markdown').notNull(),
    /** Sanitized chapter HTML for the student reader (null = markdown fallback). */
    html: text('html'),
    sourceUrl: text('source_url'),
    materialId: uuid('material_id').references(() => courseMaterials.id, {
      onDelete: 'set null',
    }),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    bookIdx: index('book_chapters_book_idx').on(table.bookId),
    courseIdx: index('book_chapters_course_idx').on(table.courseId),
    parentIdx: index('book_chapters_parent_idx').on(table.parentId),
    bookPositionIdx: index('book_chapters_book_position_idx').on(
      table.bookId,
      table.position,
    ),
  }),
);

export const bookSections = pgTable(
  'book_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookId: uuid('book_id')
      .references(() => hostedBooks.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    assignedBy: uuid('assigned_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    assignedAt: ts('assigned_at').defaultNow().notNull(),
  },
  (table) => ({
    bookSectionUnique: uniqueIndex('book_sections_unique').on(
      table.bookId,
      table.sectionId,
    ),
    sectionIdx: index('book_sections_section_idx').on(table.sectionId),
  }),
);

/** Learning: published lessons + flashcards for students. */
export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    professorId: uuid('professor_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    markdown: text('markdown').notNull(),
    /** Shah-style interactive chapter payload (null = classic markdown lesson). */
    chapter: jsonb('chapter').$type<InteractiveChapterBody | null>(),
    isActive: boolean('is_active').default(false).notNull(),
    sourceOutlineItemId: uuid('source_outline_item_id'),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    courseIdx: index('lessons_course_idx').on(table.courseId),
    professorIdx: index('lessons_professor_idx').on(table.professorId),
  }),
);

/** Practice section-check progress for interactive chapters (not gradebook). */
export const interactiveChapterProgress = pgTable(
  'interactive_chapter_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .references(() => lessons.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    /** Section id inside InteractiveChapterBody.sections[].id */
    sectionId: text('section_id').notNull(),
    attempts: integer('attempts').notNull().default(0),
    passed: boolean('passed').notNull().default(false),
    lastSubmittedAt: ts('last_submitted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    lessonStudentSectionUnique: uniqueIndex(
      'interactive_chapter_progress_unique',
    ).on(table.lessonId, table.studentId, table.sectionId),
    studentIdx: index('interactive_chapter_progress_student_idx').on(
      table.studentId,
    ),
    lessonIdx: index('interactive_chapter_progress_lesson_idx').on(
      table.lessonId,
    ),
  }),
);

export const lessonSections = pgTable(
  'lesson_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .references(() => lessons.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    assignedBy: uuid('assigned_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    assignedAt: ts('assigned_at').defaultNow().notNull(),
  },
  (table) => ({
    lessonSectionUnique: uniqueIndex('lesson_sections_unique').on(
      table.lessonId,
      table.sectionId,
    ),
    sectionIdx: index('lesson_sections_section_idx').on(table.sectionId),
  }),
);

export const flashcards = pgTable(
  'flashcards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .references(() => lessons.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    front: text('front').notNull(),
    back: text('back').notNull(),
    position: integer('position').notNull().default(0),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    lessonIdx: index('flashcards_lesson_idx').on(table.lessonId),
  }),
);

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .references(() => lessons.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    status: text('status', {
      enum: ['STARTED', 'COMPLETED'],
    })
      .default('STARTED')
      .notNull(),
    completedAt: ts('completed_at'),
    updatedAt: ts('updated_at').defaultNow().notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    lessonStudentUnique: uniqueIndex('lesson_progress_unique').on(
      table.lessonId,
      table.studentId,
    ),
    studentIdx: index('lesson_progress_student_idx').on(table.studentId),
  }),
);

/** Native H5P-inspired interactives (or imported .h5p packages). */
export type InteractiveKind =
  | 'FILL_BLANKS'
  | 'DRAG_WORDS'
  | 'IMAGE_HOTSPOTS'
  | 'ACCORDION'
  | 'H5P_PACKAGE';

export type InteractiveBody = {
  /** FILL_BLANKS: text with {{answer}} placeholders */
  text?: string;
  blanks?: Array<{ id: string; answers: string[] }>;
  /** DRAG_WORDS: sentence with {{word}} slots + distractors */
  sentence?: string;
  words?: string[];
  distractors?: string[];
  /** IMAGE_HOTSPOTS */
  imageUrl?: string;
  hotspots?: Array<{
    id: string;
    xPercent: number;
    yPercent: number;
    label: string;
    content: string;
  }>;
  /** ACCORDION */
  panels?: Array<{ id: string; title: string; body: string }>;
  /** H5P_PACKAGE metadata */
  packageFileName?: string;
  packageContentType?: string;
};

export const interactives = pgTable(
  'interactives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    professorId: uuid('professor_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    kind: text('kind', {
      enum: [
        'FILL_BLANKS',
        'DRAG_WORDS',
        'IMAGE_HOTSPOTS',
        'ACCORDION',
        'H5P_PACKAGE',
      ],
    }).notNull(),
    body: jsonb('body').$type<InteractiveBody>().notNull().default({}),
    /** S3 key for .h5p packages (H5P_PACKAGE only). */
    packageStorageKey: text('package_storage_key'),
    isActive: boolean('is_active').default(false).notNull(),
    sourceOutlineItemId: uuid('source_outline_item_id'),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    courseIdx: index('interactives_course_idx').on(table.courseId),
    professorIdx: index('interactives_professor_idx').on(table.professorId),
  }),
);

export const interactiveSections = pgTable(
  'interactive_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    interactiveId: uuid('interactive_id')
      .references(() => interactives.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    assignedBy: uuid('assigned_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    assignedAt: ts('assigned_at').defaultNow().notNull(),
  },
  (table) => ({
    interactiveSectionUnique: uniqueIndex('interactive_sections_unique').on(
      table.interactiveId,
      table.sectionId,
    ),
    sectionIdx: index('interactive_sections_section_idx').on(table.sectionId),
  }),
);

export const interactiveProgress = pgTable(
  'interactive_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    interactiveId: uuid('interactive_id')
      .references(() => interactives.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    status: text('status', {
      enum: ['STARTED', 'COMPLETED'],
    })
      .default('STARTED')
      .notNull(),
    completedAt: ts('completed_at'),
    xapiSummary: jsonb('xapi_summary').$type<Record<string, unknown>>(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    interactiveStudentUnique: uniqueIndex('interactive_progress_unique').on(
      table.interactiveId,
      table.studentId,
    ),
    studentIdx: index('interactive_progress_student_idx').on(table.studentId),
  }),
);

/**
 * Unified Assignments registry (avoids colliding with quiz `assignments`).
 * Polymorphic: exactly one of quizId / lessonId / chatbotId / interactiveId.
 */
export const courseActivities = pgTable(
  'course_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id').references(() => courses.id, {
      onDelete: 'cascade',
    }),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    professorId: uuid('professor_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    type: text('type', {
      enum: OUTLINE_ITEM_TYPES,
    }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    quizId: uuid('quiz_id').references(() => quizzes.id, {
      onDelete: 'cascade',
    }),
    lessonId: uuid('lesson_id').references(() => lessons.id, {
      onDelete: 'cascade',
    }),
    chatbotId: uuid('chatbot_id').references(() => chatbots.id, {
      onDelete: 'cascade',
    }),
    interactiveId: uuid('interactive_id').references(() => interactives.id, {
      onDelete: 'cascade',
    }),
    startDate: ts('start_date'),
    endDate: ts('end_date'),
    isActive: boolean('is_active').default(true).notNull(),
    sourceOutlineItemId: uuid('source_outline_item_id'),
    position: integer('position').notNull().default(0),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    courseIdx: index('course_activities_course_idx').on(table.courseId),
    professorIdx: index('course_activities_professor_idx').on(table.professorId),
    typeIdx: index('course_activities_type_idx').on(table.type),
    quizUnique: uniqueIndex('course_activities_quiz_unique').on(table.quizId),
    lessonUnique: uniqueIndex('course_activities_lesson_unique').on(
      table.lessonId,
    ),
    chatbotUnique: uniqueIndex('course_activities_chatbot_unique').on(
      table.chatbotId,
    ),
    interactiveUnique: uniqueIndex('course_activities_interactive_unique').on(
      table.interactiveId,
    ),
  }),
);

/** Authoring: AI-drafted course outline (modules → items). */
export const courseOutlines = pgTable(
  'course_outlines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    status: text('status', {
      enum: ['DRAFT', 'READY', 'ARCHIVED'],
    })
      .default('DRAFT')
      .notNull(),
    brief: text('brief'),
    /** True when generate used prior_course-tagged materials. */
    hasPriorCorpus: boolean('has_prior_corpus').default(false).notNull(),
    /** False while outline is skeleton-only (awaiting approve + faithful build). */
    bodiesBuilt: boolean('bodies_built').default(false).notNull(),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    courseIdx: index('course_outlines_course_idx').on(table.courseId),
    courseStatusIdx: index('course_outlines_course_status_idx').on(
      table.courseId,
      table.status,
    ),
  }),
);

export const outlineModules = pgTable(
  'outline_modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    outlineId: uuid('outline_id')
      .references(() => courseOutlines.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    title: text('title').notNull(),
    summary: text('summary'),
    position: integer('position').notNull().default(0),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    outlineIdx: index('outline_modules_outline_idx').on(table.outlineId),
  }),
);

export type OutlineSourceCitation = {
  materialId?: string;
  chunkId?: string;
  quote?: string;
};

/** Shah-style interactive chapter (LESSON body / lessons.chapter). */
export type InteractiveChapterCheckQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
};

export type InteractiveChapterSection = {
  id: string;
  title: string;
  markdown: string;
  subsections?: Array<{ id: string; title: string }>;
  checkBank: InteractiveChapterCheckQuestion[];
};

export type InteractiveChapterBody = {
  kind: 'interactive_chapter';
  subtitle?: string;
  learningObjectives: string[];
  sections: InteractiveChapterSection[];
  wrapUpMarkdown?: string;
  /** Ungraded synthesis prompt shown in the chapter player. */
  capstoneMarkdown?: string;
};

export type OutlineItemBody = {
  markdown?: string;
  description?: string;
  flashcards?: Array<{ front: string; back: string }>;
  /** Shah-style interactive chapter for LESSON items. */
  chapter?: InteractiveChapterBody;
  questions?: Array<{
    type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
    question: string;
    options?: string[];
    correctAnswer?: string;
    /** Pedagogical reference answer when distinct from key. */
    referenceAnswer?: string;
    /** Per-question grading rubric (SA). */
    rubric?: Array<{ id: string; description: string; weight: number }>;
    points?: number;
    conceptTags?: string[];
    sourceCitations?: OutlineSourceCitation[];
  }>;
  maxAttempts?: number;
  timeLimit?: number | null;
  passingScore?: number;
  /** ISO datetime — quiz window start when published. */
  startDate?: string | null;
  /** ISO datetime — quiz window end when published. */
  endDate?: string | null;
  systemPrompt?: string;
  instructions?: string;
  personaName?: string;
  /** INTERACTIVE authoring */
  interactiveKind?: Exclude<InteractiveKind, 'H5P_PACKAGE'>;
  interactiveBody?: InteractiveBody;
  /** Item-level source citations from builder. */
  sourceCitations?: OutlineSourceCitation[];
  /** Claims the builder could not ground in materials. */
  unsupportedFacts?: string[];
};

export type AuthoringReviewFlagCode =
  | 'multiple_correct'
  | 'unsupported_fact'
  | 'objective_misaligned'
  | 'ambiguity'
  | 'accessibility'
  | 'bias'
  | 'answer_leak'
  | 'rubric_mismatch'
  /** Legacy codes kept for existing stored flags. */
  | 'ambiguous_wording'
  | 'answer_in_stem'
  | 'missing_source'
  | 'difficulty_imbalance';

export type AuthoringReviewFlag = {
  code: AuthoringReviewFlagCode;
  message: string;
  questionIndex?: number;
  severity?: 'blocker' | 'major' | 'minor';
};

export const outlineItems = pgTable(
  'outline_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id')
      .references(() => outlineModules.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    type: text('type', {
      enum: OUTLINE_ITEM_TYPES,
    }).notNull(),
    title: text('title').notNull(),
    status: text('status', {
      enum: ['DRAFT', 'PREVIEW', 'PUBLISHED'],
    })
      .default('DRAFT')
      .notNull(),
    body: jsonb('body').$type<OutlineItemBody>().notNull().default({}),
    sourceMaterialIds: jsonb('source_material_ids')
      .$type<string[]>()
      .notNull()
      .default([]),
    /** Authoring reviewer flags (inline before instructor sees draft). */
    reviewFlags: jsonb('review_flags')
      .$type<AuthoringReviewFlag[]>()
      .notNull()
      .default([]),
    /** none | pending | flagged | cleared */
    reviewStatus: text('review_status').notNull().default('none'),
    /** promptVersion / model / task provenance */
    aiMeta: jsonb('ai_meta')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** When set, this item is a Switch-up variant of another outline item. */
    variantOfItemId: uuid('variant_of_item_id'),
    /** Snapshot of faithful (pre–switch-up) body for diff / restore. */
    faithfulBody: jsonb('faithful_body').$type<OutlineItemBody | null>(),
    publishedQuizId: uuid('published_quiz_id').references(() => quizzes.id, {
      onDelete: 'set null',
    }),
    publishedChatbotId: uuid('published_chatbot_id').references(
      () => chatbots.id,
      { onDelete: 'set null' },
    ),
    publishedLessonId: uuid('published_lesson_id').references(() => lessons.id, {
      onDelete: 'set null',
    }),
    publishedInteractiveId: uuid('published_interactive_id').references(
      () => interactives.id,
      { onDelete: 'set null' },
    ),
    position: integer('position').notNull().default(0),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    moduleIdx: index('outline_items_module_idx').on(table.moduleId),
  }),
);

export const authoringRevisions = pgTable(
  'authoring_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    outlineId: uuid('outline_id')
      .references(() => courseOutlines.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    label: text('label').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    outlineIdx: index('authoring_revisions_outline_idx').on(table.outlineId),
  }),
);

/** Workspace authoring standards (structure / rubric / tone) for propose/build/switch-up. */
export const authoringPolicies = pgTable(
  'authoring_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    structureNotes: text('structure_notes'),
    rubricStyle: text('rubric_style'),
    tone: text('tone'),
    extraPrompt: text('extra_prompt'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceUnique: uniqueIndex('authoring_policies_workspace_unique').on(
      table.workspaceId,
    ),
    tenantIdx: index('authoring_policies_tenant_idx').on(table.tenantId),
  }),
);

export const authoringMessages = pgTable(
  'authoring_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    outlineId: uuid('outline_id')
      .references(() => courseOutlines.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (table) => ({
    outlineIdx: index('authoring_messages_outline_idx').on(table.outlineId),
  }),
);

export const chatbotSessions = pgTable(
  'chatbot_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assignmentId: uuid('assignment_id')
      .references(() => chatbotAssignments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    chatbotId: uuid('chatbot_id')
      .references(() => chatbots.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    messages: jsonb('messages').$type<ChatbotMessage[]>().notNull().default([]),
    sessionMetadata: jsonb('session_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** Aggregated struggle topic tags from tutor turns (insights feed). */
    struggleTopics: jsonb('struggle_topics')
      .$type<string[]>()
      .notNull()
      .default([]),
    status: text('status', {
      enum: ['in_progress', 'completed'],
    })
      .default('in_progress')
      .notNull(),
    startedAt: ts('started_at').defaultNow().notNull(),
    completedAt: ts('completed_at'),
  },
  (table) => ({
    assignmentIdx: index('chatbot_sessions_assignment_idx').on(table.assignmentId),
    studentIdx: index('chatbot_sessions_student_idx').on(table.studentId),
    chatbotIdx: index('chatbot_sessions_chatbot_idx').on(table.chatbotId),
    sectionIdx: index('chatbot_sessions_section_idx').on(table.sectionId),
    // chatbot_sessions_one_open_per_assignment_idx (0019): UNIQUE(assignment_id) WHERE in_progress
  }),
);

/**
 * Canvas / LTI 1.3 Advantage platforms — scoped per workspace (institution/dept).
 * Seeded from env (LTI_*) onto the default workspace on first use.
 */
export const ltiPlatforms = pgTable(
  'lti_platforms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    issuer: text('issuer').notNull(),
    clientId: text('client_id').notNull(),
    authLoginUrl: text('auth_login_url').notNull(),
    authTokenUrl: text('auth_token_url').notNull(),
    keySetUrl: text('key_set_url').notNull(),
    label: text('label'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceIssuerClientUnique: uniqueIndex(
      'lti_platforms_workspace_issuer_client_unique',
    ).on(table.workspaceId, table.issuer, table.clientId),
    workspaceIdx: index('lti_platforms_workspace_idx').on(table.workspaceId),
    tenantIdx: index('lti_platforms_tenant_idx').on(table.tenantId),
  }),
);

export const ltiDeployments = pgTable(
  'lti_deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platformId: uuid('platform_id')
      .references(() => ltiPlatforms.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    deploymentId: text('deployment_id').notNull(),
    status: text('status', { enum: ['ACTIVE', 'INACTIVE'] })
      .default('ACTIVE')
      .notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    platformDeploymentUnique: uniqueIndex(
      'lti_deployments_platform_deployment_unique',
    ).on(table.platformId, table.deploymentId),
    platformIdx: index('lti_deployments_platform_idx').on(table.platformId),
  }),
);

/** Faculty links a SOL section to a Canvas course (optional Canvas section). */
export const ltiSectionLinks = pgTable(
  'lti_section_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    deploymentId: uuid('deployment_id')
      .references(() => ltiDeployments.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    canvasCourseId: text('canvas_course_id').notNull(),
    canvasSectionId: text('canvas_section_id'),
    /** Context id from LTI launch (often Canvas course context). */
    contextId: text('context_id'),
    agsLineItemsUrl: text('ags_line_items_url'),
    nrpsMembershipsUrl: text('nrps_memberships_url'),
    linkedByUserId: uuid('linked_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    sectionUnique: uniqueIndex('lti_section_links_section_unique').on(
      table.sectionId,
    ),
    deploymentIdx: index('lti_section_links_deployment_idx').on(
      table.deploymentId,
    ),
    canvasCourseIdx: index('lti_section_links_canvas_course_idx').on(
      table.canvasCourseId,
    ),
  }),
);

export const ltiUserLinks = pgTable(
  'lti_user_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    platformId: uuid('platform_id')
      .references(() => ltiPlatforms.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    ltiUserId: text('lti_user_id').notNull(),
    emailSnapshot: text('email_snapshot'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    platformUserUnique: uniqueIndex('lti_user_links_platform_user_unique').on(
      table.platformId,
      table.ltiUserId,
    ),
    userIdx: index('lti_user_links_user_idx').on(table.userId),
  }),
);

/** AGS line item for a SOL activity in a linked section. */
export const ltiLineItems = pgTable(
  'lti_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionLinkId: uuid('section_link_id')
      .references(() => ltiSectionLinks.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    courseActivityId: uuid('course_activity_id').references(
      () => courseActivities.id,
      { onDelete: 'cascade' },
    ),
    quizId: uuid('quiz_id').references(() => quizzes.id, {
      onDelete: 'cascade',
    }),
    lessonId: uuid('lesson_id').references(() => lessons.id, {
      onDelete: 'cascade',
    }),
    chatbotId: uuid('chatbot_id').references(() => chatbots.id, {
      onDelete: 'cascade',
    }),
    interactiveId: uuid('interactive_id').references(() => interactives.id, {
      onDelete: 'cascade',
    }),
    resourceId: text('resource_id').notNull(),
    lineItemId: text('line_item_id'),
    lineItemUrl: text('line_item_url'),
    scoreMaximum: integer('score_maximum').notNull().default(100),
    label: text('label').notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    sectionResourceUnique: uniqueIndex(
      'lti_line_items_section_resource_unique',
    ).on(table.sectionLinkId, table.resourceId),
    sectionLinkIdx: index('lti_line_items_section_link_idx').on(
      table.sectionLinkId,
    ),
  }),
);

export const ltiPassbackJobs = pgTable(
  'lti_passback_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Idempotency key e.g. quiz:{attemptId} or lesson:{lessonId}:{studentId} */
    idempotencyKey: text('idempotency_key').notNull(),
    lineItemId: uuid('line_item_id')
      .references(() => ltiLineItems.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id').references(() => workspaces.id, {
      onDelete: 'restrict',
    }),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    attemptId: uuid('attempt_id').references(() => attempts.id, {
      onDelete: 'set null',
    }),
    scoreGiven: integer('score_given'),
    scoreMaximum: integer('score_maximum').notNull().default(100),
    activityProgress: text('activity_progress').notNull().default('Completed'),
    gradingProgress: text('grading_progress').notNull().default('FullyGraded'),
    comment: text('comment'),
    status: text('status', {
      enum: ['pending', 'sent', 'failed'],
    })
      .default('pending')
      .notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    lastError: text('last_error'),
    sentAt: ts('sent_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex('lti_passback_jobs_idempotency_unique').on(
      table.idempotencyKey,
    ),
    statusIdx: index('lti_passback_jobs_status_idx').on(table.status),
    lineItemIdx: index('lti_passback_jobs_line_item_idx').on(table.lineItemId),
  }),
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  professorSections: many(professorSections),
  studentSections: many(studentSections),
  assignments: many(assignments),
  attempts: many(attempts),
  quizAssignments: many(quizSections), // quizzes assigned by this user
  quizzes: many(quizzes), // quizzes created by this user
  chatbots: many(chatbots),
  chatbotAssignments: many(chatbotAssignments),
  chatbotSessions: many(chatbotSessions),
  uploadedMaterials: many(courseMaterials),
  createdOutlines: many(courseOutlines),
  lessons: many(lessons),
  lessonProgress: many(lessonProgress),
  workspaceMemberships: many(workspaceMemberships),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  parent: one(workspaces, {
    fields: [workspaces.parentWorkspaceId],
    references: [workspaces.id],
    relationName: 'workspace_hierarchy',
  }),
  children: many(workspaces, { relationName: 'workspace_hierarchy' }),
  memberships: many(workspaceMemberships),
  licenses: many(workspaceLicenses),
  usageDaily: many(workspaceUsageDaily),
  invites: many(workspaceInvites),
  courses: many(courses),
  ltiPlatforms: many(ltiPlatforms),
}));

export const workspaceInvitesRelations = relations(
  workspaceInvites,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceInvites.workspaceId],
      references: [workspaces.id],
    }),
    claimedBy: one(users, {
      fields: [workspaceInvites.claimedByUserId],
      references: [users.id],
    }),
  }),
);

export const workspaceUsageDailyRelations = relations(
  workspaceUsageDaily,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceUsageDaily.workspaceId],
      references: [workspaces.id],
    }),
  }),
);

export const workspaceMembershipsRelations = relations(
  workspaceMemberships,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMemberships.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMemberships.userId],
      references: [users.id],
    }),
  }),
);

export const workspaceLicensesRelations = relations(
  workspaceLicenses,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceLicenses.workspaceId],
      references: [workspaces.id],
    }),
  }),
);

export const courseOfferingsRelations = relations(
  courseOfferings,
  ({ one }) => ({
    course: one(courses, {
      fields: [courseOfferings.courseId],
      references: [courses.id],
    }),
    tenant: one(workspaces, {
      fields: [courseOfferings.tenantId],
      references: [workspaces.id],
    }),
  }),
);

export const coursesRelations = relations(courses, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [courses.workspaceId],
    references: [workspaces.id],
  }),
  offerings: many(courseOfferings),
  sections: many(sections),
  materials: many(courseMaterials),
  materialChunks: many(courseMaterialChunks),
  outlines: many(courseOutlines),
  lessons: many(lessons),
  hostedBooks: many(hostedBooks),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  course: one(courses, {
    fields: [sections.courseId],
    references: [courses.id],
  }),
  offering: one(courseOfferings, {
    fields: [sections.offeringId],
    references: [courseOfferings.id],
  }),
  tenant: one(workspaces, {
    fields: [sections.tenantId],
    references: [workspaces.id],
  }),
  professorSections: many(professorSections),
  studentSections: many(studentSections),
  quizSections: many(quizSections),
  chatbotSections: many(chatbotSections),
  lessonSections: many(lessonSections),
  bookSections: many(bookSections),
  attempts: many(attempts),
  chatbotSessions: many(chatbotSessions),
}));

export const professorSectionsRelations = relations(professorSections, ({ one }) => ({
  professor: one(users, {
    fields: [professorSections.professorId],
    references: [users.id],
  }),
  section: one(sections, {
    fields: [professorSections.sectionId],
    references: [sections.id],
  }),
}));

export const studentSectionsRelations = relations(studentSections, ({ one }) => ({
  student: one(users, {
    fields: [studentSections.studentId],
    references: [users.id],
  }),
  section: one(sections, {
    fields: [studentSections.sectionId],
    references: [sections.id],
  }),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  professor: one(users, {
    fields: [quizzes.professorId],
    references: [users.id],
  }),
  questions: many(questions),
  assignments: many(assignments),
  attempts: many(attempts),
  sectionAssignments: many(quizSections), // sections this quiz is assigned to
  relatedChatbots: many(chatbots),
}));

export const quizSectionsRelations = relations(quizSections, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizSections.quizId],
    references: [quizzes.id],
  }),
  section: one(sections, {
    fields: [quizSections.sectionId],
    references: [sections.id],
  }),
  assignedBy: one(users, {
    fields: [quizSections.assignedBy],
    references: [users.id],
  }),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [questions.quizId],
    references: [quizzes.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [assignments.quizId],
    references: [quizzes.id],
  }),
  student: one(users, {
    fields: [assignments.studentId],
    references: [users.id],
  }),
  attempts: many(attempts),
}));

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  assignment: one(assignments, {
    fields: [attempts.assignmentId],
    references: [assignments.id],
  }),
  student: one(users, {
    fields: [attempts.studentId],
    references: [users.id],
  }),
  quiz: one(quizzes, {
    fields: [attempts.quizId],
    references: [quizzes.id],
  }),
  quizVersion: one(quizVersions, {
    fields: [attempts.quizVersionId],
    references: [quizVersions.id],
  }),
  section: one(sections, {
    fields: [attempts.sectionId],
    references: [sections.id],
  }),
  gradeOverrides: many(gradeOverrides),
  regradeRequests: many(regradeRequests),
}));

export const quizVersionsRelations = relations(quizVersions, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizVersions.quizId],
    references: [quizzes.id],
  }),
  createdByUser: one(users, {
    fields: [quizVersions.createdBy],
    references: [users.id],
  }),
}));

export const gradeOverridesRelations = relations(gradeOverrides, ({ one }) => ({
  attempt: one(attempts, {
    fields: [gradeOverrides.attemptId],
    references: [attempts.id],
  }),
  question: one(questions, {
    fields: [gradeOverrides.questionId],
    references: [questions.id],
  }),
  actor: one(users, {
    fields: [gradeOverrides.actorUserId],
    references: [users.id],
  }),
}));

export const chatbotsRelations = relations(chatbots, ({ one, many }) => ({
  professor: one(users, {
    fields: [chatbots.professorId],
    references: [users.id],
  }),
  relatedQuiz: one(quizzes, {
    fields: [chatbots.relatedQuizId],
    references: [quizzes.id],
  }),
  sectionAssignments: many(chatbotSections),
  assignments: many(chatbotAssignments),
  sessions: many(chatbotSessions),
}));

export const chatbotSectionsRelations = relations(chatbotSections, ({ one }) => ({
  chatbot: one(chatbots, {
    fields: [chatbotSections.chatbotId],
    references: [chatbots.id],
  }),
  section: one(sections, {
    fields: [chatbotSections.sectionId],
    references: [sections.id],
  }),
  assignedBy: one(users, {
    fields: [chatbotSections.assignedBy],
    references: [users.id],
  }),
}));

export const chatbotAssignmentsRelations = relations(
  chatbotAssignments,
  ({ one, many }) => ({
    chatbot: one(chatbots, {
      fields: [chatbotAssignments.chatbotId],
      references: [chatbots.id],
    }),
    student: one(users, {
      fields: [chatbotAssignments.studentId],
      references: [users.id],
    }),
    sessions: many(chatbotSessions),
  }),
);

export const chatbotSessionsRelations = relations(chatbotSessions, ({ one }) => ({
  assignment: one(chatbotAssignments, {
    fields: [chatbotSessions.assignmentId],
    references: [chatbotAssignments.id],
  }),
  student: one(users, {
    fields: [chatbotSessions.studentId],
    references: [users.id],
  }),
  chatbot: one(chatbots, {
    fields: [chatbotSessions.chatbotId],
    references: [chatbots.id],
  }),
  section: one(sections, {
    fields: [chatbotSessions.sectionId],
    references: [sections.id],
  }),
}));

export const courseMaterialsRelations = relations(
  courseMaterials,
  ({ one, many }) => ({
    course: one(courses, {
      fields: [courseMaterials.courseId],
      references: [courses.id],
    }),
    uploadedBy: one(users, {
      fields: [courseMaterials.uploadedByUserId],
      references: [users.id],
    }),
    chunks: many(courseMaterialChunks),
  }),
);

export const courseMaterialChunksRelations = relations(
  courseMaterialChunks,
  ({ one }) => ({
    material: one(courseMaterials, {
      fields: [courseMaterialChunks.materialId],
      references: [courseMaterials.id],
    }),
    course: one(courses, {
      fields: [courseMaterialChunks.courseId],
      references: [courses.id],
    }),
  }),
);

export const courseOutlinesRelations = relations(
  courseOutlines,
  ({ one, many }) => ({
    course: one(courses, {
      fields: [courseOutlines.courseId],
      references: [courses.id],
    }),
    createdBy: one(users, {
      fields: [courseOutlines.createdByUserId],
      references: [users.id],
    }),
    modules: many(outlineModules),
    messages: many(authoringMessages),
    revisions: many(authoringRevisions),
  }),
);

export const authoringRevisionsRelations = relations(
  authoringRevisions,
  ({ one }) => ({
    outline: one(courseOutlines, {
      fields: [authoringRevisions.outlineId],
      references: [courseOutlines.id],
    }),
  }),
);

export const authoringPoliciesRelations = relations(
  authoringPolicies,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [authoringPolicies.workspaceId],
      references: [workspaces.id],
    }),
  }),
);

export const outlineModulesRelations = relations(
  outlineModules,
  ({ one, many }) => ({
    outline: one(courseOutlines, {
      fields: [outlineModules.outlineId],
      references: [courseOutlines.id],
    }),
    items: many(outlineItems),
  }),
);

export const outlineItemsRelations = relations(outlineItems, ({ one }) => ({
  module: one(outlineModules, {
    fields: [outlineItems.moduleId],
    references: [outlineModules.id],
  }),
  publishedQuiz: one(quizzes, {
    fields: [outlineItems.publishedQuizId],
    references: [quizzes.id],
  }),
  publishedChatbot: one(chatbots, {
    fields: [outlineItems.publishedChatbotId],
    references: [chatbots.id],
  }),
  publishedLesson: one(lessons, {
    fields: [outlineItems.publishedLessonId],
    references: [lessons.id],
  }),
  publishedInteractive: one(interactives, {
    fields: [outlineItems.publishedInteractiveId],
    references: [interactives.id],
  }),
}));

export const authoringMessagesRelations = relations(
  authoringMessages,
  ({ one }) => ({
    outline: one(courseOutlines, {
      fields: [authoringMessages.outlineId],
      references: [courseOutlines.id],
    }),
  }),
);

export const hostedBooksRelations = relations(hostedBooks, ({ one, many }) => ({
  course: one(courses, {
    fields: [hostedBooks.courseId],
    references: [courses.id],
  }),
  createdBy: one(users, {
    fields: [hostedBooks.createdByUserId],
    references: [users.id],
  }),
  chapters: many(bookChapters),
  sectionAssignments: many(bookSections),
}));

export const bookChaptersRelations = relations(
  bookChapters,
  ({ one, many }) => ({
    book: one(hostedBooks, {
      fields: [bookChapters.bookId],
      references: [hostedBooks.id],
    }),
    course: one(courses, {
      fields: [bookChapters.courseId],
      references: [courses.id],
    }),
    material: one(courseMaterials, {
      fields: [bookChapters.materialId],
      references: [courseMaterials.id],
    }),
    parent: one(bookChapters, {
      fields: [bookChapters.parentId],
      references: [bookChapters.id],
      relationName: 'bookChapterTree',
    }),
    children: many(bookChapters, { relationName: 'bookChapterTree' }),
  }),
);

export const bookSectionsRelations = relations(bookSections, ({ one }) => ({
  book: one(hostedBooks, {
    fields: [bookSections.bookId],
    references: [hostedBooks.id],
  }),
  section: one(sections, {
    fields: [bookSections.sectionId],
    references: [sections.id],
  }),
  assignedBy: one(users, {
    fields: [bookSections.assignedBy],
    references: [users.id],
  }),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  professor: one(users, {
    fields: [lessons.professorId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [lessons.courseId],
    references: [courses.id],
  }),
  sectionAssignments: many(lessonSections),
  flashcards: many(flashcards),
  progress: many(lessonProgress),
}));

export const lessonSectionsRelations = relations(lessonSections, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonSections.lessonId],
    references: [lessons.id],
  }),
  section: one(sections, {
    fields: [lessonSections.sectionId],
    references: [sections.id],
  }),
  assignedBy: one(users, {
    fields: [lessonSections.assignedBy],
    references: [users.id],
  }),
}));

export const flashcardsRelations = relations(flashcards, ({ one }) => ({
  lesson: one(lessons, {
    fields: [flashcards.lessonId],
    references: [lessons.id],
  }),
}));

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonProgress.lessonId],
    references: [lessons.id],
  }),
  student: one(users, {
    fields: [lessonProgress.studentId],
    references: [users.id],
  }),
}));

export const interactivesRelations = relations(interactives, ({ one, many }) => ({
  professor: one(users, {
    fields: [interactives.professorId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [interactives.courseId],
    references: [courses.id],
  }),
  sectionAssignments: many(interactiveSections),
  progress: many(interactiveProgress),
}));

export const interactiveSectionsRelations = relations(
  interactiveSections,
  ({ one }) => ({
    interactive: one(interactives, {
      fields: [interactiveSections.interactiveId],
      references: [interactives.id],
    }),
    section: one(sections, {
      fields: [interactiveSections.sectionId],
      references: [sections.id],
    }),
    assignedBy: one(users, {
      fields: [interactiveSections.assignedBy],
      references: [users.id],
    }),
  }),
);

export const interactiveProgressRelations = relations(
  interactiveProgress,
  ({ one }) => ({
    interactive: one(interactives, {
      fields: [interactiveProgress.interactiveId],
      references: [interactives.id],
    }),
    student: one(users, {
      fields: [interactiveProgress.studentId],
      references: [users.id],
    }),
  }),
);

export const courseActivitiesRelations = relations(
  courseActivities,
  ({ one }) => ({
    course: one(courses, {
      fields: [courseActivities.courseId],
      references: [courses.id],
    }),
    professor: one(users, {
      fields: [courseActivities.professorId],
      references: [users.id],
    }),
    quiz: one(quizzes, {
      fields: [courseActivities.quizId],
      references: [quizzes.id],
    }),
    lesson: one(lessons, {
      fields: [courseActivities.lessonId],
      references: [lessons.id],
    }),
    chatbot: one(chatbots, {
      fields: [courseActivities.chatbotId],
      references: [chatbots.id],
    }),
    interactive: one(interactives, {
      fields: [courseActivities.interactiveId],
      references: [interactives.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Canvas-like LMS: modules, pages, announcements, peer discussions,
// assignment groups, outcomes, course rubrics
// ---------------------------------------------------------------------------

export type ModuleCompletionRequirement = {
  type: 'view' | 'submit' | 'score_at_least';
  /** Required when type is score_at_least (0–100). */
  minPercent?: number;
};

export const courseModules = pgTable(
  'course_modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    position: integer('position').notNull().default(0),
    published: boolean('published').notNull().default(false),
    unlockAt: ts('unlock_at'),
    /** UUID[] of prerequisite course_modules.id */
    prerequisiteModuleIds: jsonb('prerequisite_module_ids')
      .$type<string[]>()
      .notNull()
      .default([]),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    courseIdx: index('course_modules_course_idx').on(t.courseId),
    tenantIdx: index('course_modules_tenant_idx').on(t.tenantId),
  }),
);

export const moduleItems = pgTable(
  'module_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id')
      .references(() => courseModules.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    position: integer('position').notNull().default(0),
    title: text('title').notNull(),
    /** Text header row (no content link). */
    isHeader: boolean('is_header').notNull().default(false),
    type: text('type', {
      enum: [
        'HEADER',
        'LESSON',
        'QUIZ',
        'DISCUSSION',
        'TUTOR',
        'INTERACTIVE',
        'PAGE',
        'FILE',
        'EXTERNAL_URL',
        'ANNOUNCEMENT',
      ],
    }).notNull(),
    lessonId: uuid('lesson_id').references(() => lessons.id, {
      onDelete: 'set null',
    }),
    quizId: uuid('quiz_id').references(() => quizzes.id, {
      onDelete: 'set null',
    }),
    chatbotId: uuid('chatbot_id').references(() => chatbots.id, {
      onDelete: 'set null',
    }),
    interactiveId: uuid('interactive_id').references(() => interactives.id, {
      onDelete: 'set null',
    }),
    pageId: uuid('page_id'),
    peerDiscussionId: uuid('peer_discussion_id'),
    materialId: uuid('material_id'),
    externalUrl: text('external_url'),
    completionRequirement: jsonb(
      'completion_requirement',
    ).$type<ModuleCompletionRequirement | null>(),
    published: boolean('published').notNull().default(true),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    moduleIdx: index('module_items_module_idx').on(t.moduleId),
    tenantIdx: index('module_items_tenant_idx').on(t.tenantId),
  }),
);

export const moduleSections = pgTable(
  'module_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id')
      .references(() => courseModules.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    assignedAt: ts('assigned_at').defaultNow().notNull(),
  },
  (t) => ({
    moduleSectionUnique: uniqueIndex('module_sections_unique').on(
      t.moduleId,
      t.sectionId,
    ),
    sectionIdx: index('module_sections_section_idx').on(t.sectionId),
  }),
);

export const moduleItemProgress = pgTable(
  'module_item_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleItemId: uuid('module_item_id')
      .references(() => moduleItems.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    status: text('status', {
      enum: ['STARTED', 'COMPLETED'],
    })
      .notNull()
      .default('STARTED'),
    completedAt: ts('completed_at'),
    updatedAt: ts('updated_at').defaultNow().notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => ({
    itemStudentUnique: uniqueIndex('module_item_progress_unique').on(
      t.moduleItemId,
      t.studentId,
    ),
    studentIdx: index('module_item_progress_student_idx').on(t.studentId),
  }),
);

export const coursePages = pgTable(
  'course_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    markdown: text('markdown').notNull().default(''),
    published: boolean('published').notNull().default(false),
    position: integer('position').notNull().default(0),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    courseSlugUnique: uniqueIndex('course_pages_course_slug_uidx').on(
      t.courseId,
      t.slug,
    ),
    courseIdx: index('course_pages_course_idx').on(t.courseId),
  }),
);

export const courseAnnouncements = pgTable(
  'course_announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    authorUserId: uuid('author_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    bodyMarkdown: text('body_markdown').notNull().default(''),
    publishedAt: ts('published_at'),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    courseIdx: index('course_announcements_course_idx').on(t.courseId),
  }),
);

/** Peer discussion boards (distinct from AI tutor chatbots). */
export const peerDiscussions = pgTable(
  'peer_discussions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    promptMarkdown: text('prompt_markdown').notNull().default(''),
    published: boolean('published').notNull().default(false),
    assignmentGroupId: uuid('assignment_group_id'),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    courseIdx: index('peer_discussions_course_idx').on(t.courseId),
  }),
);

export const assignmentGroups = pgTable(
  'assignment_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    name: text('name').notNull(),
    /** Weight toward final grade (0–100). Weights should sum to 100. */
    weight: integer('weight').notNull().default(0),
    dropLowest: integer('drop_lowest').notNull().default(0),
    position: integer('position').notNull().default(0),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    courseIdx: index('assignment_groups_course_idx').on(t.courseId),
  }),
);

/** Links a graded quiz (or later other activities) to an assignment group. */
export const assignmentGroupMembers = pgTable(
  'assignment_group_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .references(() => assignmentGroups.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    quizId: uuid('quiz_id').references(() => quizzes.id, {
      onDelete: 'cascade',
    }),
    peerDiscussionId: uuid('peer_discussion_id').references(
      () => peerDiscussions.id,
      { onDelete: 'cascade' },
    ),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => ({
    groupIdx: index('assignment_group_members_group_idx').on(t.groupId),
    quizUnique: uniqueIndex('assignment_group_members_quiz_uidx').on(t.quizId),
  }),
);

export const learningOutcomes = pgTable(
  'learning_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description'),
    /** Mastery threshold 0–100. */
    masteryPercent: integer('mastery_percent').notNull().default(70),
    position: integer('position').notNull().default(0),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    courseIdx: index('learning_outcomes_course_idx').on(t.courseId),
  }),
);

/** Reusable course-level rubrics (beyond per-question SA JSON). */
export const courseRubrics = pgTable(
  'course_rubrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    criteria: jsonb('criteria')
      .$type<Array<{ id: string; description: string; weight: number; points?: number }>>()
      .notNull()
      .default([]),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    courseIdx: index('course_rubrics_course_idx').on(t.courseId),
  }),
);

export const courseModulesRelations = relations(courseModules, ({ one, many }) => ({
  course: one(courses, {
    fields: [courseModules.courseId],
    references: [courses.id],
  }),
  items: many(moduleItems),
  sections: many(moduleSections),
}));

export const moduleItemsRelations = relations(moduleItems, ({ one }) => ({
  module: one(courseModules, {
    fields: [moduleItems.moduleId],
    references: [courseModules.id],
  }),
}));

export const moduleSectionsRelations = relations(moduleSections, ({ one }) => ({
  module: one(courseModules, {
    fields: [moduleSections.moduleId],
    references: [courseModules.id],
  }),
  section: one(sections, {
    fields: [moduleSections.sectionId],
    references: [sections.id],
  }),
}));
