'use client';

import { apiFetch } from '@/lib/api/client';
import { withBasePath } from '@/lib/basePath';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { 
  Plus, 
  Trash2, 
  Save, 
  FileText,
  Clock,
  Users,
  Target,
  AlertCircle
} from '@/components/icons';
import { SectionMultiSelect } from '@/components/ui/SectionMultiSelect';
import { DEFAULT_PASSING_SCORE, QUIZ_LIMITS } from '@/lib/quizSchemas';
import { toast } from 'sonner';
import { ReleaseBadge } from '@/components/status/badges';

interface Question {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
  question: string;
  options?: string[] | null;
  correctAnswer?: string | null;
  points: number;
  order: number;
}

function normalizeQuestion(question: Question, index: number): Question {
  return {
    ...question,
    id: question.id || `question-${index}`,
    question: question.question || '',
    options: Array.isArray(question.options) ? question.options : question.options ?? null,
    correctAnswer: question.correctAnswer || '',
    points:
      typeof question.points === 'number' && !Number.isNaN(question.points)
        ? question.points
        : 1,
  };
}

interface Quiz {
  id: string;
  title: string;
  description?: string | null;
  courseId?: string | null;
  maxAttempts: number;
  timeLimit?: number | null;
  passingScore?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  isActive: boolean;
  hideFeedbackAfterDue?: boolean;
  questions: Question[];
  course?: {
    id: string;
    title: string;
  } | null;
}

interface Section {
  id: string;
  title: string;
}

interface QuizEditFormProps {
  quiz: Quiz;
  courses: Section[]; // Keep the prop name for backward compatibility but it's actually sections
  apiEndpoint?: string;
  onSuccess?: () => void;
  assignedSectionIds?: string[];
}

export function QuizEditForm({ quiz, courses, apiEndpoint = `/api/professor/quiz/${quiz.id}/update`, onSuccess, assignedSectionIds = [] }: QuizEditFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
  
  // Helper function to extract date and time from a Date object
  // Use local timezone methods - display what the user sees in their local time
  const extractDateAndTime = (date: Date | string | null | undefined) => {
    if (!date) return { date: '', time: '' };
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return { date: '', time: '' };
    
    // Get date in YYYY-MM-DD format (local timezone - what user sees)
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Get time in HH:MM format (local timezone - what user sees)
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    
    return { date: dateStr, time: timeStr };
  };

  const startDateTime = extractDateAndTime(quiz.startDate);
  const endDateTime = extractDateAndTime(quiz.endDate);

  // Form state
  const [formData, setFormData] = useState({
    title: quiz.title,
    description: quiz.description ?? '',
    courseId: quiz.courseId || 'global',
    maxAttempts: quiz.maxAttempts,
    // null = untimed; editing must not invent a limit.
    timeLimit: (quiz.timeLimit ?? null) as number | null,
    passingScore:
      typeof quiz.passingScore === 'number'
        ? quiz.passingScore
        : DEFAULT_PASSING_SCORE,
    startDate: startDateTime.date,
    startTime: startDateTime.time,
    endDate: endDateTime.date,
    endTime: endDateTime.time,
    isActive: quiz.isActive,
    hideFeedbackAfterDue: quiz.hideFeedbackAfterDue ?? false,
  });
  const [passingScoreError, setPassingScoreError] = useState<string | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<Question[]>(
    (quiz.questions || []).map(normalizeQuestion),
  );
  const [sectionIds, setSectionIds] = useState<string[]>(assignedSectionIds);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const addQuestion = () => {
    const newQuestion: Question = {
      id: `temp-${Date.now()}-${questions.length}`,
      type: 'MULTIPLE_CHOICE',
      question: '',
      options: ['', '', '', ''],
      correctAnswer: '',
      points: 1,
      order: questions.length + 1,
    };
    setQuestions((current) => [...current, newQuestion]);
  };

  const removeQuestion = (index: number) => {
    setQuestions((current) => current.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    setQuestions((current) =>
      current.map((question, i) =>
        i === index ? { ...question, [field]: value } : question,
      ),
    );
  };

  const updateQuestionOption = (questionIndex: number, optionIndex: number, value: string) => {
    setQuestions((current) =>
      current.map((question, i) => {
        if (i !== questionIndex) return question;
        const options = [...(question.options || [])];
        options[optionIndex] = value;
        return { ...question, options };
      }),
    );
  };

  const onSubmit = async () => {
    // Check if professor has any sections available
    if (courses.length === 0) {
      toast.error('You need to be enrolled in at least one section to save this quiz.');
      return;
    }

    if (sectionIds.length === 0) {
      setSectionError('Please assign the quiz to at least one section.');
      toast.error('Assign this quiz to at least one section.');
      setCurrentStep(1);
      return;
    }
    setSectionError(null);

    if (
      typeof formData.passingScore !== 'number' ||
      Number.isNaN(formData.passingScore) ||
      formData.passingScore < 0 ||
      formData.passingScore > 100
    ) {
      setPassingScoreError('Passing score must be a whole number between 0 and 100.');
      toast.error('Passing score must be a whole number between 0 and 100.');
      setCurrentStep(1);
      return;
    }
    setPassingScoreError(null);

    if (
      !formData.startDate ||
      !formData.startTime ||
      !formData.endDate ||
      !formData.endTime
    ) {
      setWindowError('Start and end date and time are required.');
      toast.error('Start and end date and time are required.');
      setCurrentStep(1);
      return;
    }

    // Combine date and time into ISO strings
    // The user enters time in their local timezone (e.g., "2:00 PM")
    // We need to store it as UTC, but interpret the input as local time
    // When displaying, we'll convert back to local time
    const combineDateTime = (date: string, time: string) => {
      if (!date) return undefined;
      if (!time) {
        // If no time provided, use start of day in local timezone
        const [year, month, day] = date.split('-').map(Number);
        const localDate = new Date(year, month - 1, day, 0, 0, 0);
        // Convert local time to UTC ISO string
        return localDate.toISOString();
      }
      // Parse date and time components
      const [year, month, day] = date.split('-').map(Number);
      const [hours, minutes] = time.split(':').map(Number);
      // Create date in local timezone (user's input is interpreted as local time)
      const localDate = new Date(year, month - 1, day, hours, minutes, 0);
      // Convert to UTC ISO string - this preserves the "moment in time" correctly
      // When displayed later, toLocaleString() will convert back to local time
      return localDate.toISOString();
    };

    const startDateTime = combineDateTime(formData.startDate, formData.startTime);
    const endDateTime = combineDateTime(formData.endDate, formData.endTime);

    if (!startDateTime || !endDateTime) {
      setWindowError('Start and end date and time are required.');
      toast.error('Start and end date and time are required.');
      setCurrentStep(1);
      return;
    }

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    if (end <= start) {
      setWindowError('End date and time must be after start date and time');
      return;
    }
    setWindowError(null);

    setIsSubmitting(true);
    try {
      const response = await apiFetch(apiEndpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          hideFeedbackAfterDue: formData.hideFeedbackAfterDue,
          maxAttempts: formData.maxAttempts,
          timeLimit: formData.timeLimit ?? undefined,
          passingScore: formData.passingScore,
          isActive: formData.isActive,
          startDate: startDateTime,
          endDate: endDateTime,
          questions: questions.map((q, index) => ({
            id: q.id,
            type: q.type,
            question: q.question,
            // Only send options for MCQ — null breaks Zod array validation.
            options:
              q.type === 'MULTIPLE_CHOICE' && Array.isArray(q.options)
                ? q.options
                : undefined,
            correctAnswer: q.correctAnswer ?? undefined,
            points: q.points,
            order: index + 1,
          })),
          sectionIds,
        }),
      });

      if (response.ok) {
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(
            `/dashboard/professor/assignments?type=QUIZ&success=true&quizId=${quiz.id}`,
          );
        }
      } else {
        let message = 'Failed to update quiz';
        try {
          const errBody = await response.json();
          if (typeof errBody?.error === 'string') message = errBody.error;
          if (Array.isArray(errBody?.details) && errBody.details[0]?.message) {
            message = `${message}: ${errBody.details[0].message}`;
          }
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
    } catch (error) {
      console.error('Error updating quiz:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update quiz',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1 && sectionIds.length === 0) {
      setSectionError('Please assign the quiz to at least one section.');
      toast.error('Assign this quiz to at least one section.');
      return;
    }
    setSectionError(null);
    if (currentStep === 2 && questions.length === 0) {
      toast.error('Add at least one question.');
      return;
    }
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getStepStatus = (step: number) => {
    if (step < currentStep) return 'completed';
    if (step === currentStep) return 'current';
    return 'upcoming';
  };

  const stepTitles = ['Settings', 'Questions', 'Review'];

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Progress" className="paper paper-shadow p-6">
        <ol className="flex items-center justify-between gap-4">
          {stepTitles.map((title, idx) => {
            const stepNum = idx + 1;
            const status = getStepStatus(stepNum);
            const isCompleted = status === 'completed';
            const isCurrent = status === 'current';
            return (
              <li key={title} className="flex items-center gap-3 flex-1">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border tnum text-xs font-medium ${
                    isCompleted ? 'bg-brand text-paper border-brand' :
                    isCurrent ? 'bg-paper text-brand border-brand shadow-[0_0_0_2px_var(--brand-soft)]' :
                    'bg-surface text-ink-faint border-rule'
                  }`}
                >
                  {stepNum}
                </div>
                <span className={`eyebrow whitespace-nowrap ${isCurrent ? 'text-ink' : 'text-ink-faint'}`}>
                  {title}
                </span>
                {idx < stepTitles.length - 1 ? (
                  <div className={`flex-1 h-px ${isCompleted ? 'bg-brand' : 'bg-rule'}`} />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      {currentStep === 1 && (
        <section className="paper paper-shadow p-6 md:p-8 flex flex-col gap-6">
          <header>
            <span className="eyebrow text-ink-faint">Step 1</span>
            <h2 className="font-display text-2xl text-ink mt-1">Settings</h2>
          </header>

          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Quiz title</Label>
            <Input
              id="title"
              maxLength={QUIZ_LIMITS.titleMax}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter quiz title"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter quiz description (optional)"
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sectionIds">
              Assign to sections <span className="text-danger">*</span>
            </Label>
            {courses.length === 0 ? (
              <div className="p-4 border border-warning/40 bg-warning-soft/40 rounded-md">
                <div className="flex items-center gap-2 text-warning-fg">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">No sections available</span>
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  You need to be enrolled in at least one section.{" "}
                  <a href={withBasePath('/dashboard/professor/sections')} className="text-brand hover:underline">
                    Join a section
                  </a>
                </p>
              </div>
            ) : (
              <>
                <SectionMultiSelect
                  options={courses}
                  value={sectionIds}
                  onChange={selected => {
                    setSectionIds(selected);
                    setSectionError(null);
                  }}
                  placeholder="Select sections…"
                />
                {sectionError && <div className="text-xs text-danger mt-1">{sectionError}</div>}
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="maxAttempts" className="flex items-center gap-2">
                <Users className="h-4 w-4 text-ink-faint" />
                Max attempts
              </Label>
              <Input
                id="maxAttempts"
                type="number"
                min="1"
                max="10"
                value={typeof formData.maxAttempts === 'number' && !isNaN(formData.maxAttempts) ? formData.maxAttempts : 1}
                onChange={(e) => setFormData({ ...formData, maxAttempts: parseInt(e.target.value) || 1 })}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="timeLimit" className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-ink-faint" />
                Time limit (min)
              </Label>
              <Input
                id="timeLimit"
                type="number"
                min="1"
                max={QUIZ_LIMITS.timeLimitMaxMinutes}
                placeholder="No limit"
                value={formData.timeLimit ?? ''}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setFormData({ ...formData, timeLimit: Number.isFinite(n) && n > 0 ? n : null });
                }}
              />
            </div>

            <div className="md:col-span-2 lg:col-span-4 flex flex-col gap-2">
              <Label htmlFor="passingScore" className="flex items-center gap-2">
                <Target className="h-4 w-4 text-ink-faint" />
                Passing score (%)
              </Label>
              <Input
                id="passingScore"
                type="number"
                min={0}
                max={100}
                value={
                  typeof formData.passingScore === 'number' &&
                  !isNaN(formData.passingScore)
                    ? formData.passingScore
                    : 60
                }
                onChange={(e) => {
                  const next = parseInt(e.target.value);
                  setFormData({
                    ...formData,
                    passingScore: Number.isFinite(next) ? next : 0,
                  });
                  if (passingScoreError) setPassingScoreError(null);
                }}
              />
              <p className="text-xs text-ink-faint">
                Learners scoring at or above this percentage are marked passed.
              </p>
              {passingScoreError ? (
                <p className="text-xs text-danger">{passingScoreError}</p>
              ) : null}
            </div>

            <div className="md:col-span-2 flex flex-row items-start justify-between rounded-md border border-rule p-4 bg-surface-sunken/40">
              <div className="space-y-0.5 max-w-prose">
                <Label className="text-base">
                  Hide feedback until after the due date
                </Label>
                <div className="text-sm text-ink-muted">
                  Students see only their score before the due date; full feedback unlocks afterwards.
                </div>
              </div>
              <Switch
                checked={formData.hideFeedbackAfterDue}
                onCheckedChange={(checked) => setFormData({ ...formData, hideFeedbackAfterDue: checked })}
              />
            </div>

            <div className="md:col-span-2 flex flex-row items-center justify-between rounded-md border border-rule p-4 bg-surface-sunken/40">
              <div>
                <Label className="text-base">Quiz status</Label>
                <p className="text-sm text-ink-muted">
                  {formData.isActive ? 'Visible to learners' : 'Hidden from learners'}
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startDate">Start date & time *</Label>
              <Input
                id="startDate"
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
              <Input
                id="startTime"
                type="time"
                required
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">End date & time (due) *</Label>
              <Input
                id="endDate"
                type="date"
                required
                value={formData.endDate}
                min={formData.startDate || undefined}
                onChange={(e) => {
                  const newEndDate = e.target.value;
                  if (formData.startDate && newEndDate < formData.startDate) {
                    setFormData({ ...formData, endDate: formData.startDate });
                  } else {
                    setFormData({ ...formData, endDate: newEndDate });
                  }
                }}
              />
              <Input
                id="endTime"
                type="time"
                required
                value={formData.endTime}
                onChange={(e) => {
                  const newEndTime = e.target.value;
                  if (formData.startDate && formData.endDate === formData.startDate && formData.startTime) {
                    if (newEndTime <= formData.startTime) {
                      toast.error('End time must be after start time on the same day');
                      return;
                    }
                  }
                  setFormData({ ...formData, endTime: newEndTime });
                }}
              />
              {formData.startDate && formData.endDate === formData.startDate && formData.startTime && (
                <p className="text-xs text-ink-faint">
                  Same day: end time must be after {formData.startTime}.
                </p>
              )}
              {windowError && (
                <p className="text-sm text-red-600 md:col-span-2">{windowError}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {currentStep === 2 && (
        <section className="paper paper-shadow p-6 md:p-8 flex flex-col gap-6">
          <header className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="eyebrow text-ink-faint">Step 2</span>
              <h2 className="font-display text-2xl text-ink mt-1">
                Questions <span className="text-ink-faint tnum text-base">· {questions.length}</span>
              </h2>
            </div>
            <Button onClick={addQuestion} size="sm">
              <Plus className="h-4 w-4" />
              Add question
            </Button>
          </header>

          {questions.length === 0 ? (
            <div className="paper border border-rule rounded-md p-10 text-center">
              <FileText className="h-8 w-8 mx-auto mb-3 text-ink-faint" />
              <h3 className="font-display text-lg text-ink mb-1">No questions yet.</h3>
              <p className="text-sm text-ink-muted mb-5">
                Add your first question to get started.
              </p>
              <Button onClick={addQuestion}>
                <Plus className="h-4 w-4" />
                Add first question
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {questions.map((question, index) => (
                <article
                  key={question.id}
                  className="border border-rule rounded-md p-5 bg-surface flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="eyebrow text-ink-faint">
                      Question {index + 1}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Select
                        value={question.type}
                        onValueChange={(value: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER') =>
                          updateQuestion(index, 'type', value)
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MULTIPLE_CHOICE">Multiple choice</SelectItem>
                          <SelectItem value="TRUE_FALSE">True / false</SelectItem>
                          <SelectItem value="SHORT_ANSWER">Short answer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeQuestion(index)}
                        aria-label="Remove question"
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Question text</Label>
                    <Textarea
                      value={question.question}
                      onChange={(e) => updateQuestion(index, 'question', e.target.value)}
                      placeholder="Enter your question"
                      rows={2}
                    />
                  </div>

                  {question.type === 'MULTIPLE_CHOICE' && (
                    <div className="flex flex-col gap-2">
                      <Label>Options</Label>
                      {question.options?.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center gap-2">
                          <Input
                            value={option}
                            onChange={(e) => updateQuestionOption(index, optionIndex, e.target.value)}
                            placeholder={`Option ${optionIndex + 1}`}
                          />
                          <Button
                            variant={question.correctAnswer === option ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => updateQuestion(index, 'correctAnswer', option)}
                          >
                            Correct
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {(question.type === 'TRUE_FALSE' || question.type === 'SHORT_ANSWER') && (
                    <div className="flex flex-col gap-2">
                      <Label>Correct answer</Label>
                      <Input
                        value={question.correctAnswer || ''}
                        onChange={(e) => updateQuestion(index, 'correctAnswer', e.target.value)}
                        placeholder={question.type === 'TRUE_FALSE' ? 'true or false' : 'Enter correct answer'}
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-2 max-w-[200px]">
                    <Label>Points</Label>
                    <Input
                      type="number"
                      min="1"
                      value={typeof question.points === 'number' && !isNaN(question.points) ? question.points : 1}
                      onChange={(e) => updateQuestion(index, 'points', parseInt(e.target.value) || 1)}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {currentStep === 3 && (
        <section className="paper paper-shadow p-6 md:p-8 flex flex-col gap-8">
          <header>
            <span className="eyebrow text-ink-faint">Step 3</span>
            <h2 className="font-display text-2xl text-ink mt-1">Review & save</h2>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="eyebrow text-ink-faint mb-3">Quiz</h3>
              <dl className="text-sm flex flex-col gap-2">
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-32 shrink-0">Title</dt>
                  <dd className="text-ink">{formData.title}</dd>
                </div>
                <div className="flex gap-2 items-center">
                  <dt className="text-ink-muted w-32 shrink-0">Status</dt>
                  <dd>
                    <ReleaseBadge isActive={formData.isActive} />
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-32 shrink-0">Max attempts</dt>
                  <dd className="text-ink tnum">{formData.maxAttempts}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-32 shrink-0">Time limit</dt>
                  <dd className="text-ink tnum">
                    {formData.timeLimit ? `${formData.timeLimit} min` : 'No limit'}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="eyebrow text-ink-faint mb-3">Questions</h3>
              <dl className="text-sm flex flex-col gap-2">
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-32 shrink-0">Total</dt>
                  <dd className="text-ink tnum">{questions.length}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-32 shrink-0">Multiple choice</dt>
                  <dd className="text-ink tnum">
                    {questions.filter(q => q.type === 'MULTIPLE_CHOICE').length}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-32 shrink-0">True / false</dt>
                  <dd className="text-ink tnum">
                    {questions.filter(q => q.type === 'TRUE_FALSE').length}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-32 shrink-0">Short answer</dt>
                  <dd className="text-ink tnum">
                    {questions.filter(q => q.type === 'SHORT_ANSWER').length}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-32 shrink-0">Total points</dt>
                  <dd className="text-ink tnum">
                    {questions.reduce((sum, q) => sum + q.points, 0)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {formData.description ? (
            <div>
              <h3 className="eyebrow text-ink-faint mb-2">Description</h3>
              <p className="text-ink-muted max-w-prose">{formData.description}</p>
            </div>
          ) : null}
        </section>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1}>
          Previous
        </Button>

        {currentStep < 3 ? (
          <Button type="button" onClick={nextStep}>
            {questions.length === 0
              ? 'Add questions first'
              : courses.length === 0
                ? 'No sections available'
                : 'Next'}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            loading={isSubmitting}
          >
            <Save className="h-4 w-4" />
            {isSubmitting
              ? 'Saving…'
              : courses.length === 0
                ? 'No sections available'
                : 'Save changes'}
          </Button>
        )}
      </div>
    </div>
  );
} 