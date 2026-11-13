import { fetchUserEnrollmentsDetail } from '@/lib/db/facultyStudentReads';
import { isSectionConcluded } from '@/lib/sectionAvailability';

/** Resolve an optional ?section= id to a breadcrumb-safe label if the student is enrolled. */
export async function resolveStudentSectionBreadcrumb(
  studentId: string,
  sectionId: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  if (!sectionId) return null;
  const enrollments = await fetchUserEnrollmentsDetail(studentId);
  const hit = enrollments.find((e) => e.sectionId === sectionId);
  if (!hit?.section || isSectionConcluded(hit.section)) {
    return null;
  }
  return { id: hit.section.id, name: hit.section.name };
}
