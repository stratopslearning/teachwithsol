export type EnrollmentSource = 'lti' | 'code' | 'csv' | 'invite';

export function normalizeEnrollmentSources(
  raw: unknown,
): EnrollmentSource[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<EnrollmentSource>(['lti', 'code', 'csv', 'invite']);
  const out: EnrollmentSource[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && allowed.has(item as EnrollmentSource)) {
      if (!out.includes(item as EnrollmentSource)) {
        out.push(item as EnrollmentSource);
      }
    }
  }
  return out;
}

export function appendEnrollmentSource(
  existing: unknown,
  source: EnrollmentSource,
): EnrollmentSource[] {
  const list = normalizeEnrollmentSources(existing);
  if (!list.includes(source)) list.push(source);
  return list;
}

export function removeEnrollmentSource(
  existing: unknown,
  source: EnrollmentSource,
): EnrollmentSource[] {
  return normalizeEnrollmentSources(existing).filter((s) => s !== source);
}

export type UpsertStudentEnrollmentInput = {
  studentId: string;
  sectionId: string;
  source: EnrollmentSource;
  tenantId?: string | null;
  offeringId?: string | null;
  /** When true, offering dual-write failures are logged only (LTI/NRPS). Default fail-closed. */
  bestEffortOfferingSync?: boolean;
};

export type UpsertStudentEnrollmentResult = {
  enrollmentId: string;
  created: boolean;
  reactivated: boolean;
  sources: EnrollmentSource[];
};

export type UpsertStudentEnrollmentOptions = UpsertStudentEnrollmentInput & {
  /**
   * When true, refuse if the student already has an ACTIVE enrollment in
   * another non-concluded section of the same course (code enroll path).
   */
  refuseCourseConflict?: boolean;
};

/** Idempotent enroll: one row per student+section; sources accumulate. */
export async function upsertStudentEnrollment(
  input: UpsertStudentEnrollmentOptions,
): Promise<UpsertStudentEnrollmentResult> {
  // FORCE RLS: bare student_sections / student_offerings writes flake on Neon.
  // Definer must see the section under FORCE RLS — pass tenantId whenever known.
  let tenantId = input.tenantId;
  if (!tenantId) {
    const { fetchSectionById } = await import('@/lib/db/entityScopedReads');
    const section = await fetchSectionById(input.sectionId);
    tenantId = section?.tenantId ?? section?.workspaceId ?? undefined;
  }
  const { upsertStudentEnrollmentDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  const result = await upsertStudentEnrollmentDefiner({
    studentId: input.studentId,
    sectionId: input.sectionId,
    source: input.source,
    tenantId,
    offeringId: input.offeringId,
    refuseCourseConflict: input.refuseCourseConflict,
    bestEffortOfferingSync: input.bestEffortOfferingSync,
  });
  return {
    enrollmentId: result.enrollmentId,
    created: result.created,
    reactivated: result.reactivated,
    sources: normalizeEnrollmentSources(result.sources),
  };
}

/** After an external roster removes a learner, drop only when no sources remain. */
export async function applyEnrollmentSourceRemoval(opts: {
  studentId: string;
  sectionId: string;
  source: EnrollmentSource;
}): Promise<'dropped' | 'active' | 'missing'> {
  const { applyEnrollmentSourceRemovalDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  return applyEnrollmentSourceRemovalDefiner(opts);
}
