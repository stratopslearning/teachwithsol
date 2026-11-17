import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { comparePersonsByLastName } from '@/lib/personName';
import { asDate, rowsFromExecute } from '@/lib/db/rows';

export type SectionEnrollmentRow = {
  id: string;
  enrolledAt: Date;
  status: string;
  person: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
};

export type SectionQuizRow = {
  id: string;
  title: string;
  description: string | null;
  endDate: Date | null;
  submissionCount: number;
};

export type SectionDiscussionRow = {
  id: string;
  title: string;
  personaName: string;
  relatedQuizTitle: string | null;
};

export type SectionDetailData = {
  section: {
    id: string;
    name: string;
    courseId: string;
    professorEnrollmentCode: string;
    studentEnrollmentCode: string;
    endsAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    course: {
      id: string;
      title: string;
      description: string | null;
    } | null;
  };
  learnerEnrollments: SectionEnrollmentRow[];
  facultyEnrollments: SectionEnrollmentRow[];
  activeLearnerCount: number;
  activeFacultyCount: number;
  quizzes: SectionQuizRow[];
  discussions: SectionDiscussionRow[];
};

function asDateRequired(value: Date | string | null | undefined): Date {
  return asDate(value) ?? new Date(0);
}

type DetailPayload = {
  section: {
    id: string;
    name: string;
    courseId: string;
    professorEnrollmentCode: string;
    studentEnrollmentCode: string;
    endsAt: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    course: {
      id: string;
      title: string;
      description: string | null;
    } | null;
  };
  learnerEnrollments: Array<{
    id: string;
    enrolledAt: Date | string;
    status: string;
    person: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    };
  }>;
  facultyEnrollments: Array<{
    id: string;
    enrolledAt: Date | string;
    status: string;
    person: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    };
  }>;
  quizzes: Array<{
    id: string;
    title: string;
    description: string | null;
    endDate: Date | string | null;
    submissionCount: number;
  }>;
  discussions: Array<{
    id: string;
    title: string;
    personaName: string;
    relatedQuizTitle: string | null;
  }>;
};

/**
 * Section detail under FORCE RLS via SECURITY DEFINER (sol_section_detail).
 * Bare drizzle reads return empty for sol_app without a sticky tenant GUC.
 */
export async function loadSectionDetailData(
  sectionId: string,
): Promise<SectionDetailData | null> {
  const result = await db.execute(sql`
    SELECT sol_section_detail(${sectionId}::uuid) AS payload
  `);
  const raw = rowsFromExecute<{ payload: unknown }>(result)[0]?.payload;
  const payload =
    typeof raw === 'string'
      ? (JSON.parse(raw) as DetailPayload)
      : (raw as DetailPayload | null | undefined);
  if (!payload?.section) return null;

  const learnerEnrollments: SectionEnrollmentRow[] = (
    payload.learnerEnrollments ?? []
  )
    .map((e) => ({
      id: e.id,
      enrolledAt: asDateRequired(e.enrolledAt),
      status: e.status,
      person: e.person,
    }))
    .sort((a, b) => comparePersonsByLastName(a.person, b.person));

  const facultyEnrollments: SectionEnrollmentRow[] = (
    payload.facultyEnrollments ?? []
  )
    .map((e) => ({
      id: e.id,
      enrolledAt: asDateRequired(e.enrolledAt),
      status: e.status,
      person: e.person,
    }))
    .sort((a, b) => comparePersonsByLastName(a.person, b.person));

  return {
    section: {
      id: payload.section.id,
      name: payload.section.name,
      courseId: payload.section.courseId,
      professorEnrollmentCode: payload.section.professorEnrollmentCode,
      studentEnrollmentCode: payload.section.studentEnrollmentCode,
      endsAt: asDate(payload.section.endsAt),
      createdAt: asDateRequired(payload.section.createdAt),
      updatedAt: asDateRequired(payload.section.updatedAt),
      course: payload.section.course,
    },
    learnerEnrollments,
    facultyEnrollments,
    activeLearnerCount: learnerEnrollments.filter((e) => e.status === 'ACTIVE')
      .length,
    activeFacultyCount: facultyEnrollments.filter((e) => e.status === 'ACTIVE')
      .length,
    quizzes: (payload.quizzes ?? []).map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      endDate: asDate(quiz.endDate),
      submissionCount: Number(quiz.submissionCount) || 0,
    })),
    discussions: payload.discussions ?? [],
  };
}
