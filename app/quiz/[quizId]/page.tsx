import { AppShell } from '@/components/layout/AppShell';
import { QuizTakeForm } from '@/components/quiz/QuizTakeForm';
import { QuizUnavailable } from '@/components/quiz/QuizUnavailable';
import { isStudentEntitled } from '@/lib/featureFlags';
import { requireLearningAccess } from '@/lib/authz/gates';
import type { UserData } from '@/lib/getOrCreateUser';
import { getQuizAvailability } from '@/lib/quizAvailability';
import {
  availabilityReasonToBlockCode,
  type QuizBlockCode,
} from '@/lib/quizBlockCopy';
import { assertStudentCanOpenQuiz } from '@/lib/quizEnrollment';
import { fetchQuizTakeBundleDefiner } from '@/lib/db/studentWriteDefiners';
import { isSectionConcluded } from '@/lib/sectionAvailability';
import { appRedirect } from '@/lib/serverRedirect';
import { cleanQuizDescription, normalizeDatabaseDate } from '@/lib/utils';

interface QuizPageProps {
  params: Promise<{ quizId: string }>;
}

function blocked(
  user: UserData,
  props: {
    code: QuizBlockCode;
    quizTitle?: string | null;
    opensAt?: Date | string | null;
    closedAt?: Date | string | null;
  },
) {
  return (
    <AppShell
      role="student"
      user={user}
      topbarTitle={props.quizTitle || 'Quiz'}
    >
      <QuizUnavailable {...props} />
    </AppShell>
  );
}

export default async function QuizPage(props: QuizPageProps) {
  const params = await props.params;
  const quizId = params.quizId;

  const user = await requireLearningAccess();
  if (!isStudentEntitled(user)) appRedirect('/payment');

  const bundle = await fetchQuizTakeBundleDefiner(quizId, user.id);
  if (!bundle?.quiz) return blocked(user, { code: 'quiz_unavailable' });

  const quiz = bundle.quiz;
  const now = new Date();
  const startDate = normalizeDatabaseDate(quiz.startDate);
  const endDate = normalizeDatabaseDate(quiz.endDate);

  if (startDate && now < startDate) {
    return blocked(user, {
      code: 'quiz_not_started',
      quizTitle: quiz.title,
      opensAt: startDate,
    });
  }
  if (endDate && now > endDate) {
    return blocked(user, {
      code: 'quiz_ended',
      quizTitle: quiz.title,
      closedAt: endDate,
    });
  }

  const open = assertStudentCanOpenQuiz(bundle.resolvedSectionId);
  if (!open.allowed) {
    return blocked(user, { code: 'not_enrolled', quizTitle: quiz.title });
  }

  const assignment = bundle.assignment;
  if (!assignment) {
    return blocked(user, { code: 'quiz_unavailable', quizTitle: quiz.title });
  }

  const inProgressAttempt = bundle.inProgressAttempt;
  const section = bundle.section;

  if (isSectionConcluded(section, now) && !inProgressAttempt) {
    return blocked(user, {
      code: 'section_concluded',
      quizTitle: quiz.title,
    });
  }

  const availability = getQuizAvailability(quiz, assignment, now);
  if (!availability.allowed && !inProgressAttempt) {
    return blocked(user, {
      code: availabilityReasonToBlockCode(availability.reason),
      quizTitle: quiz.title,
      opensAt: startDate,
      closedAt: endDate,
    });
  }

  const quizEndDate = normalizeDatabaseDate(quiz.endDate);
  const quizQuestions = bundle.questions;

  return (
    <div className="bg-paper text-ink min-h-screen">
      <QuizTakeForm
        quiz={{
          id: quiz.id,
          title: quiz.title,
          description: quiz.description
            ? cleanQuizDescription(quiz.description)
            : undefined,
          timeLimit: quiz.timeLimit || undefined,
          endDate: quizEndDate ? quizEndDate.toISOString() : null,
          totalQuestions: quizQuestions.length,
        }}
        questions={quizQuestions.map((q) => ({
          id: q.id,
          type: q.type,
          question: q.question,
          options:
            typeof q.options === 'string'
              ? JSON.parse(q.options)
              : Array.isArray(q.options)
                ? q.options
                : undefined,
          order: q.order,
          points: q.points,
        }))}
        assignmentId={assignment.id}
        userId={user.id}
        userRole="STUDENT"
      />
    </div>
  );
}
