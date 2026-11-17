import { AppShell } from '@/components/layout/AppShell';
import { QuizTakeForm } from '@/components/quiz/QuizTakeForm';
import { QuizUnavailable } from '@/components/quiz/QuizUnavailable';
import { isStudentEntitled } from '@/lib/featureFlags';
import { requireLearningAccess } from '@/lib/authz/gates';
import type { UserData } from '@/lib/getOrCreateUser';
import { effectiveQuizCloseDate } from '@/lib/quiz/availability';
import type { QuizBlockCode } from '@/lib/quiz/blockCopy';
import { evaluateQuizAccess, type QuizAccessReason } from '@/lib/quiz/accessPolicy';
import { assertStudentCanOpenQuiz } from '@/lib/quiz/enrollment';
import { fetchQuizTakeBundleDefiner } from '@/lib/db/studentWriteDefiners';
import { appRedirect } from '@/lib/serverRedirect';
import { normalizeDatabaseDate } from '@/lib/utils';

const BLOCK_CODE: Record<QuizAccessReason, QuizBlockCode> = {
  archived: 'quiz_unavailable',
  notStarted: 'quiz_not_started',
  ended: 'quiz_ended',
  dueDatePassed: 'due_date_passed',
  sectionConcluded: 'section_concluded',
  // Not checked for `view`; listed for completeness.
  maxAttempts: 'quiz_unavailable',
  timeLimit: 'quiz_unavailable',
};

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

  const open = assertStudentCanOpenQuiz(bundle.resolvedSectionId);
  if (!open.allowed) {
    return blocked(user, { code: 'not_enrolled', quizTitle: quiz.title });
  }

  const assignment = bundle.assignment;
  if (!assignment) {
    return blocked(user, { code: 'quiz_unavailable', quizTitle: quiz.title });
  }

  const inProgressAttempt = bundle.inProgressAttempt;

  // Same rules as start and submit (lib/quiz/accessPolicy), so the page can't
  // show a quiz the API then refuses.
  const access = evaluateQuizAccess(
    {
      quiz,
      assignment,
      section: bundle.section,
      inProgressAttempt,
      submittedCount: 0,
      now,
    },
    'view',
  );
  if (!access.ok) {
    return blocked(user, {
      code: BLOCK_CODE[access.reason],
      quizTitle: quiz.title,
      opensAt: startDate,
      closedAt: endDate,
    });
  }

  // Countdown and auto-submit use the close time the server enforces.
  const quizEndDate = effectiveQuizCloseDate(quiz, assignment);
  const quizQuestions = bundle.questions;

  return (
    <div className="bg-paper text-ink min-h-screen">
      <QuizTakeForm
        quiz={{
          id: quiz.id,
          title: quiz.title,
          description: quiz.description ?? undefined,
          timeLimit: quiz.timeLimit || undefined,
          endDate: quizEndDate ? quizEndDate.toISOString() : null,
          hideFeedbackAfterDue: quiz.hideFeedbackAfterDue,
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
