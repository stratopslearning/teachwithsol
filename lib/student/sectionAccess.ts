import { notFound } from 'next/navigation';

import { fetchUserEnrollmentsDetail } from '@/lib/db/facultyStudentReads';
import { isSectionConcluded } from '@/lib/sectionAvailability';

export type StudentSectionContext = {
  sectionId: string;
  sectionName: string;
  courseId: string;
  courseTitle: string;
  endsAt: Date | string | null;
};

/**
 * Active, non-concluded enrollment for a student section hub.
 * FORCE RLS: bare student_sections reads hide cross-tenant enrollments → 404.
 * Use the BYPASSRLS enrollments DEFINER instead.
 */
export async function requireStudentSectionAccess(
  studentId: string,
  sectionId: string,
): Promise<StudentSectionContext> {
  const enrollments = await fetchUserEnrollmentsDetail(studentId);
  const hit = enrollments.find((e) => e.sectionId === sectionId);
  const section = hit?.section;
  if (!hit || !section || isSectionConcluded(section)) {
    notFound();
  }

  return {
    sectionId: section.id,
    sectionName: section.name,
    courseId: section.course.id,
    courseTitle: section.course.title ?? 'Course',
    endsAt: section.endsAt ?? null,
  };
}
