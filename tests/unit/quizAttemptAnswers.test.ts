import { describe, expect, it } from 'vitest';

import {
  buildLegacyQuestionKeyMap,
  remapAttemptPayloadKeys,
  resolveAttemptAnswer,
  resolveAttemptFeedback,
} from '@/lib/quiz/attemptAnswers';

const currentQuestions = [
  {
    id: '96683cae-3fc1-43fa-a00c-851b76303903',
    order: 1,
    question:
      'What is the primary difference between Quality Assurance and Quality Control?',
  },
  {
    id: '945e9049-68d4-49e5-bf40-37afb2a24172',
    order: 2,
    question:
      'Explain the significance of customer perspective in defining quality.',
  },
  {
    id: '54a1da33-947e-4218-b9a9-a7ce55125111',
    order: 3,
    question:
      'Describe the eight dimensions of product quality and provide an example for each.',
  },
  {
    id: '160a8d45-efe8-4aff-9168-01840d33ebcf',
    order: 4,
    question: 'What are the four categories of the Cost of Quality (CoQ)?',
  },
  {
    id: '5974dff8-f48b-4413-9914-15a6f2e1adfe',
    order: 5,
    question:
      'How does Statistical Process Control (SPC) contribute to quality management in supply chains?',
  },
];

const legacyAnswers = {
  '0ba18a5f-4152-4fb1-85ec-5d86afaf10e5':
    'SPC contributes to quality management in supply chains by monitoring processes.',
  '11d0a062-a5d2-4d86-8166-04d47d9b0de6':
    'The four categories of the Cost of Quality are prevention, appraisal, internal failure, and external failure.',
  '3401d40c-e967-4a9c-a5b4-e4deb27bd796':
    'Quality assurance is proactive and prevents defects, while quality control is reactive.',
  '8eb3a9b3-0f7d-464b-800f-b7c73022eb5d':
    'The eight dimensions of product quality include performance, features, reliability, conformance, durability, serviceability, aesthetics, and perceived quality.',
  'd61bc1ea-17fc-422c-bc2d-82ef2d00f3d0':
    'Quality is ultimately defined by customer expectations and satisfaction.',
};

const legacyFeedback = {
  '3401d40c-e967-4a9c-a5b4-e4deb27bd796': {
    score: 1,
    feedback: 'Correctly states the prevention vs detection distinction.',
  },
  'd61bc1ea-17fc-422c-bc2d-82ef2d00f3d0': {
    score: 0,
    feedback: 'Grading system temporarily unavailable.',
  },
};

describe('buildLegacyQuestionKeyMap', () => {
  it('maps legacy answer keys to current question ids by content', () => {
    const keyMap = buildLegacyQuestionKeyMap(
      currentQuestions,
      legacyAnswers,
      legacyFeedback,
    );

    expect(keyMap.get(currentQuestions[0]!.id)).toBe(
      '3401d40c-e967-4a9c-a5b4-e4deb27bd796',
    );
    expect(keyMap.get(currentQuestions[1]!.id)).toBe(
      'd61bc1ea-17fc-422c-bc2d-82ef2d00f3d0',
    );
    expect(keyMap.get(currentQuestions[4]!.id)).toBe(
      '0ba18a5f-4152-4fb1-85ec-5d86afaf10e5',
    );
  });

  it('returns direct keys when attempt already matches current question ids', () => {
    const directAnswers = {
      [currentQuestions[0]!.id]: 'answer one',
    };
    const keyMap = buildLegacyQuestionKeyMap(currentQuestions, directAnswers);

    expect(keyMap.get(currentQuestions[0]!.id)).toBe(currentQuestions[0]!.id);
    expect(resolveAttemptAnswer(currentQuestions[0]!.id, directAnswers, keyMap)).toBe(
      'answer one',
    );
  });
});

describe('remapAttemptPayloadKeys', () => {
  it('rewrites answers and feedback to current question ids', () => {
    const remapped = remapAttemptPayloadKeys(
      currentQuestions,
      legacyAnswers,
      legacyFeedback,
    );

    expect(remapped.answers[currentQuestions[0]!.id]).toContain(
      'Quality assurance is proactive',
    );
    expect(remapped.gptFeedback[currentQuestions[0]!.id]).toEqual(
      legacyFeedback['3401d40c-e967-4a9c-a5b4-e4deb27bd796'],
    );
    expect(
      remapped.answers['3401d40c-e967-4a9c-a5b4-e4deb27bd796'],
    ).toBeUndefined();
  });
});

describe('resolveAttemptFeedback', () => {
  it('reads feedback from the mapped legacy key', () => {
    const keyMap = buildLegacyQuestionKeyMap(
      currentQuestions,
      legacyAnswers,
      legacyFeedback,
    );

    expect(
      resolveAttemptFeedback(currentQuestions[0]!.id, legacyFeedback, keyMap)
        ?.score,
    ).toBe(1);
  });
});
