export type QuizQuestionRef = {
  id: string;
  order: number;
  question: string;
  correctAnswer?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const METADATA_KEYS = new Set([
  'maxAttempts',
  'attemptNumber',
  'totalAttempts',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );
}

function overlapScore(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return 0;
  const left = tokenize(a);
  const right = tokenize(b);
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

function bundleScore(
  question: QuizQuestionRef,
  answers: Record<string, unknown>,
  gptFeedback: Record<string, unknown>,
  storageKey: string,
): number {
  const answerText = String(answers[storageKey] ?? '');
  const feedbackObj = gptFeedback[storageKey] as
    | { feedback?: string }
    | undefined;
  const feedbackText = feedbackObj?.feedback ?? '';

  const referenceAnswer = question.correctAnswer ?? '';

  return (
    overlapScore(referenceAnswer, answerText) +
    overlapScore(question.question, answerText) +
    overlapScore(referenceAnswer, feedbackText) +
    overlapScore(question.question, feedbackText) * 2
  );
}

function collectStorageKeys(
  answers: Record<string, unknown>,
  gptFeedback: Record<string, unknown>,
): string[] {
  const keys = new Set<string>();

  for (const key of Object.keys(answers)) {
    if (UUID_RE.test(key) && !METADATA_KEYS.has(key)) {
      keys.add(key);
    }
  }

  for (const key of Object.keys(gptFeedback)) {
    if (UUID_RE.test(key) && !METADATA_KEYS.has(key)) {
      keys.add(key);
    }
  }

  return [...keys];
}

function assignStorageKeysToQuestions(
  quizQuestions: QuizQuestionRef[],
  answers: Record<string, unknown>,
  gptFeedback: Record<string, unknown>,
  storageKeys: string[],
): Map<string, string> {
  const sortedQuestions = [...quizQuestions].sort((a, b) => a.order - b.order);
  const scoredPairs: Array<{
    questionId: string;
    storageKey: string;
    score: number;
  }> = [];

  for (const question of sortedQuestions) {
    for (const storageKey of storageKeys) {
      scoredPairs.push({
        questionId: question.id,
        storageKey,
        score: bundleScore(question, answers, gptFeedback, storageKey),
      });
    }
  }

  scoredPairs.sort((a, b) => b.score - a.score);

  const keyMap = new Map<string, string>();
  const usedQuestions = new Set<string>();
  const usedStorageKeys = new Set<string>();

  for (const pair of scoredPairs) {
    if (usedQuestions.has(pair.questionId) || usedStorageKeys.has(pair.storageKey)) {
      continue;
    }
    if (pair.score <= 0) {
      continue;
    }
    keyMap.set(pair.questionId, pair.storageKey);
    usedQuestions.add(pair.questionId);
    usedStorageKeys.add(pair.storageKey);
  }

  const remainingQuestions = sortedQuestions.filter(
    (question) => !keyMap.has(question.id),
  );
  const remainingStorageKeys = storageKeys
    .filter((key) => !usedStorageKeys.has(key))
    .sort();

  if (
    remainingQuestions.length === remainingStorageKeys.length &&
    remainingQuestions.length > 0
  ) {
    remainingQuestions.forEach((question, index) => {
      keyMap.set(question.id, remainingStorageKeys[index]!);
    });
  }

  return keyMap;
}

function identityKeyMap(
  quizQuestions: QuizQuestionRef[],
): Map<string, string> {
  return new Map(quizQuestions.map((question) => [question.id, question.id]));
}

function totalAssignmentScore(
  quizQuestions: QuizQuestionRef[],
  keyMap: Map<string, string>,
  answers: Record<string, unknown>,
  gptFeedback: Record<string, unknown>,
): number {
  return quizQuestions.reduce((sum, question) => {
    const storageKey = keyMap.get(question.id) ?? question.id;
    return sum + bundleScore(question, answers, gptFeedback, storageKey);
  }, 0);
}

/**
 * When a quiz is edited with delete-and-reinsert, attempt JSON keeps old
 * question UUID keys. Map each current question id to the storage key that
 * holds its answer/feedback bundle (answer + feedback scored together).
 */
export function buildLegacyQuestionKeyMap(
  quizQuestions: QuizQuestionRef[],
  answers: Record<string, unknown>,
  gptFeedback: Record<string, unknown> = {},
): Map<string, string> {
  const storageKeys = collectStorageKeys(answers, gptFeedback);
  if (storageKeys.length === 0) {
    return identityKeyMap(quizQuestions);
  }

  const assignedKeyMap = assignStorageKeysToQuestions(
    quizQuestions,
    answers,
    gptFeedback,
    storageKeys,
  );

  const identityMap = identityKeyMap(quizQuestions);
  const assignedScore = totalAssignmentScore(
    quizQuestions,
    assignedKeyMap,
    answers,
    gptFeedback,
  );
  const identityScore = totalAssignmentScore(
    quizQuestions,
    identityMap,
    answers,
    gptFeedback,
  );

  if (assignedScore > identityScore) {
    return assignedKeyMap;
  }

  const hasMisalignedBundles = quizQuestions.some((question) => {
    const storageKey = identityMap.get(question.id) ?? question.id;
    const directScore = bundleScore(question, answers, gptFeedback, storageKey);
    const bestScore = Math.max(
      ...storageKeys.map((key) =>
        bundleScore(question, answers, gptFeedback, key),
      ),
    );
    return bestScore > directScore;
  });

  if (hasMisalignedBundles) {
    return assignedKeyMap;
  }

  return identityMap;
}

export function resolveAttemptAnswer(
  questionId: string,
  answers: Record<string, unknown>,
  keyMap: Map<string, string>,
): unknown {
  const storageKey = keyMap.get(questionId) ?? questionId;
  return answers[storageKey];
}

export function resolveAttemptFeedback<T>(
  questionId: string,
  gptFeedback: Record<string, T>,
  keyMap: Map<string, string>,
): T | undefined {
  const storageKey = keyMap.get(questionId) ?? questionId;
  return gptFeedback[storageKey];
}

export function remapAttemptPayloadKeys(
  quizQuestions: QuizQuestionRef[],
  answers: Record<string, unknown>,
  gptFeedback: Record<string, unknown>,
): {
  answers: Record<string, unknown>;
  gptFeedback: Record<string, unknown>;
  keyMap: Map<string, string>;
} {
  const keyMap = buildLegacyQuestionKeyMap(quizQuestions, answers, gptFeedback);
  const remappedAnswers: Record<string, unknown> = {};
  const remappedFeedback: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(answers)) {
    if (!UUID_RE.test(key)) {
      remappedAnswers[key] = value;
    }
  }

  for (const [key, value] of Object.entries(gptFeedback)) {
    if (!UUID_RE.test(key)) {
      remappedFeedback[key] = value;
    }
  }

  for (const question of quizQuestions) {
    const storageKey = keyMap.get(question.id) ?? question.id;

    if (answers[storageKey] !== undefined) {
      remappedAnswers[question.id] = answers[storageKey];
    }

    if (gptFeedback[storageKey] !== undefined) {
      remappedFeedback[question.id] = gptFeedback[storageKey];
    }
  }

  return {
    answers: remappedAnswers,
    gptFeedback: remappedFeedback,
    keyMap,
  };
}
