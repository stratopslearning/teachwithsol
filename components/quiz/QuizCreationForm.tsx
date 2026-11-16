"use client";

import { apiUrl, withBasePath } from '@/lib/basePath';
import {
  downloadCsvTemplate,
  QUIZ_QUESTIONS_CSV_TEMPLATE,
} from '@/lib/csv/downloadTemplate';
import { QUESTION_TYPES } from '@/app/db/enums';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Plus, 
  Trash2, 
  Save, 
  Eye, 
  ArrowRight, 
  ArrowLeft,
  FileText,
  CheckCircle,
  AlertCircle,
  Upload,
  CalendarIcon
} from '@/components/icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { cn, buildQuizDescriptionWithMetadata } from '@/lib/utils';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SectionMultiSelect } from '@/components/ui/SectionMultiSelect';

const quizDateWindow = {
  startDate: z.date({ required_error: 'Start date is required' }),
  endDate: z.date({ required_error: 'End date is required' }),
};

const quizWindowRefine = {
  message: 'End date and time must be after start date and time',
  path: ['endDate'],
};

// Form validation: the settings step validates `quizBasicFields`, the final
// submit validates the same fields plus questions.
const quizBasicFields = z.object({
  title: z.string().min(1, 'Quiz title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().optional(),
  maxAttempts: z.number().min(1, 'Max attempts must be at least 1').max(10, 'Max attempts cannot exceed 10'),
  timeLimit: z.number().min(1, 'Time limit must be at least 1 minute').max(180, 'Time limit cannot exceed 3 hours'),
  passingScore: z
    .number()
    .int('Passing score must be a whole number')
    .min(0, 'Passing score must be 0 or higher')
    .max(100, 'Passing score cannot exceed 100'),
  ...quizDateWindow,
  hideFeedbackAfterDue: z.boolean(),
});
const quizBasicSchema = quizBasicFields.refine(
  (data) => data.endDate > data.startDate,
  quizWindowRefine,
);

const questionSchema = z.object({
  question: z.string().min(1, 'Question text is required'),
  type: z.enum(QUESTION_TYPES),
  points: z.number().min(1, 'Points must be at least 1'),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
});

const quizSchema = quizBasicFields
  .extend({
    questions: z.array(questionSchema).min(1, 'At least one question is required'),
  })
  .refine((data) => data.endDate > data.startDate, quizWindowRefine);

type QuizFormData = z.infer<typeof quizSchema>;

interface Section {
  id: string;
  title: string;
  description?: string | null;
}

interface QuizCreationFormProps {
  courses: Section[]; // Keep the prop name for backward compatibility but it's actually sections
  apiEndpoint?: string;
  /** Pre-select sections (e.g. all sections for a course hub create). */
  defaultSectionIds?: string[];
  /** Where to go after a successful create. */
  successHref?: string;
  /** Jump straight to CSV upload (step 2). */
  initialStep?: number;
}

export function QuizCreationForm({
  courses,
  apiEndpoint,
  defaultSectionIds,
  successHref,
  initialStep = 1,
}: QuizCreationFormProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(() =>
    Math.min(3, Math.max(1, initialStep)),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sectionIds, setSectionIds] = useState<string[]>(() => {
    const allowed = new Set(courses.map((c) => c.id));
    return (defaultSectionIds ?? []).filter((id) => allowed.has(id));
  });
  const [sectionError, setSectionError] = useState<string | null>(null);

  const form = useForm<QuizFormData>({
    resolver: zodResolver(quizSchema),
    defaultValues: {
      title: '',
      description: '',
      maxAttempts: 1,
      timeLimit: 30,
      passingScore: 60,
      startDate: undefined,
      endDate: undefined,
      hideFeedbackAfterDue: false,
      questions: [
        {
          question: '',
          type: 'MULTIPLE_CHOICE',
          points: 1,
          options: ['', '', '', ''],
          correctAnswer: '',
        },
      ],
    },
  });

  const { watch, setValue, getValues } = form;
  const watchedQuestions = watch('questions');

  const addQuestion = () => {
    const currentQuestions = getValues('questions');
    setValue('questions', [
      ...currentQuestions,
      {
        question: '',
        type: 'MULTIPLE_CHOICE',
        points: 1,
        options: ['', '', '', ''],
        correctAnswer: '',
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    const currentQuestions = getValues('questions');
    if (currentQuestions.length > 1) {
      setValue('questions', currentQuestions.filter((_: any, i: number) => i !== index));
    }
  };

  const updateQuestionOptions = (questionIndex: number, optionIndex: number, value: string) => {
    const currentQuestions = getValues('questions');
    const updatedQuestions = [...currentQuestions];
    if (updatedQuestions[questionIndex].options) {
      updatedQuestions[questionIndex].options![optionIndex] = value;
      setValue('questions', updatedQuestions);
    }
  };

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('Please upload a valid CSV file');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          setCsvError('CSV must have at least a header row and one question');
          return;
        }

        const questions: any[] = [];
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        // Validate headers
        const requiredHeaders = ['question', 'type', 'options', 'correct_answer'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        
        if (missingHeaders.length > 0) {
          setCsvError(`Missing required headers: ${missingHeaders.join(', ')}`);
          return;
        }

        // Parse questions
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const questionIndex = headers.indexOf('question');
          const typeIndex = headers.indexOf('type');
          const optionsIndex = headers.indexOf('options');
          const correctAnswerIndex = headers.indexOf('correct_answer');
          const pointsIndex = headers.indexOf('points');

          const question = values[questionIndex];
          const type = values[typeIndex]?.toUpperCase();
          const optionsStr = values[optionsIndex];
          const correctAnswer = values[correctAnswerIndex];
          const pointsRaw = pointsIndex !== -1 ? values[pointsIndex] : undefined;
          let points = 1;
          if (pointsRaw && !isNaN(Number(pointsRaw)) && Number(pointsRaw) > 0) {
            points = Number(pointsRaw);
          }

          if (!question || !type) {
            setCsvError(`Row ${i + 1}: Missing question or type`);
            return;
          }

          if (!(QUESTION_TYPES as readonly string[]).includes(type)) {
            setCsvError(`Row ${i + 1}: Invalid type. Must be MULTIPLE_CHOICE, TRUE_FALSE, or SHORT_ANSWER`);
            return;
          }

          let options: string[] = [];
          if (type === 'MULTIPLE_CHOICE' && optionsStr) {
            options = optionsStr.split('|').map(opt => opt.trim()).filter(opt => opt);
            if (options.length < 2) {
              setCsvError(`Row ${i + 1}: Multiple choice questions need at least 2 options`);
              return;
            }
          }

          questions.push({
            question,
            type,
            points,
            options: type === 'MULTIPLE_CHOICE' ? options : undefined,
            correctAnswer: correctAnswer || '',
          });
        }

        setValue('questions', questions, { shouldDirty: true, shouldValidate: true });
        // Also reset the form's questions field to only the imported questions
        form.reset({ ...getValues(), questions });
        setCsvError(null);
        
        // Clear the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch {
        setCsvError('Error parsing CSV file');
      }
    };
    reader.readAsText(file);
  };

  const onSubmit = async (data: QuizFormData) => {
    if (courses.length === 0) {
      toast.error('Join a section before creating a quiz.');
      setCurrentStep(1);
      return;
    }

    if (sectionIds.length === 0) {
      setSectionError('Assign this quiz to at least one section.');
      toast.error('Assign this quiz to at least one section.');
      setCurrentStep(1);
      return;
    }
    setSectionError(null);
    setIsSubmitting(true);
    try {
      const questionsWithOrder = data.questions.map((q, idx) => ({ ...q, order: idx }));
      const response = await fetch(apiUrl(apiEndpoint || '/api/professor/quiz/create'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          startDate: data.startDate.toISOString(),
          endDate: data.endDate.toISOString(),
          description: buildQuizDescriptionWithMetadata(
            data.description,
            data.hideFeedbackAfterDue,
          ),
          sectionIds: sectionIds,
          questions: questionsWithOrder,
        }),
      });

      if (response.ok) {
        toast.success('Quiz created successfully!');
        if (successHref) {
          router.push(successHref);
        } else if (apiEndpoint && apiEndpoint.includes('/admin/quiz/create')) {
          router.push('/dashboard/admin/assignments?type=QUIZ');
        } else {
          router.push('/dashboard/professor/assignments?type=QUIZ');
        }
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error || 'Failed to create quiz');
    } catch (error) {
      console.error('Error creating quiz:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create quiz');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = async () => {
    if (currentStep === 1) {
      const parsed = quizBasicSchema.safeParse(form.getValues());
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const path = issue.path[0];
          if (typeof path === 'string') {
            form.setError(path as keyof QuizFormData, {
              type: 'manual',
              message: issue.message,
            });
          }
        }
        await form.trigger([
          'title',
          'maxAttempts',
          'timeLimit',
          'passingScore',
          'startDate',
          'endDate',
        ]);
        toast.error(parsed.error.issues[0]?.message ?? 'Complete the required fields to continue.');
        return;
      }
      if (courses.length === 0) {
        toast.error('Join a section before creating a quiz.');
        return;
      }
      if (sectionIds.length === 0) {
        setSectionError('Please assign the quiz to at least one section.');
        toast.error('Assign this quiz to at least one section.');
        return;
      }
      setSectionError(null);
    }
    if (currentStep === 2) {
      const parsed = z
        .object({ questions: z.array(questionSchema).min(1, 'Add at least one question') })
        .safeParse({ questions: form.getValues('questions') });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? 'Fix the questions before continuing.');
        return;
      }
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

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Progress" className="paper paper-shadow p-6">
        <ol className="flex items-center justify-between gap-4">
          {[
            { number: 1, title: 'Basics', icon: FileText },
            { number: 2, title: 'Questions', icon: CheckCircle },
            { number: 3, title: 'Review', icon: Eye },
          ].map((step, index) => {
            const Icon = step.icon;
            const status = getStepStatus(step.number);
            const isCompleted = status === 'completed';
            const isCurrent = status === 'current';
            return (
              <li key={step.number} className="flex items-center gap-3 flex-1">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border tnum text-xs font-medium',
                    isCompleted && 'bg-brand text-paper border-brand',
                    isCurrent && 'bg-paper text-brand border-brand shadow-[0_0_0_2px_var(--brand-soft)]',
                    !isCompleted && !isCurrent && 'bg-surface text-ink-faint border-rule',
                  )}
                >
                  {isCompleted ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span
                  className={cn(
                    'eyebrow whitespace-nowrap',
                    isCurrent ? 'text-ink' : 'text-ink-faint',
                  )}
                >
                  {step.title}
                </span>
                {index < 2 ? (
                  <div
                    className={cn(
                      'flex-1 h-px',
                      isCompleted ? 'bg-brand' : 'bg-rule',
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit, () => {
            toast.error('Please fix the highlighted fields and try again.');
          })}
          className="flex flex-col gap-6"
        >
          {currentStep === 1 && (
            <section className="paper paper-shadow p-6 md:p-8 flex flex-col gap-6">
              <header>
                <span className="eyebrow text-ink-faint">Step 1</span>
                <h2 className="font-display text-2xl text-ink mt-1">Basic information</h2>
              </header>
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quiz title *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Midterm, Topic 4" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="A short summary of the topic, instructions, or expectations…" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                        Join a section before creating a quiz.{" "}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="maxAttempts"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max attempts *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="1"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timeLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time limit (minutes) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="30"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="passingScore"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Passing score (%) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            placeholder="60"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <p className="text-xs text-ink-faint mt-1">
                          Learners scoring at or above this percentage are marked
                          passed. Default 60.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="hideFeedbackAfterDue"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2 flex flex-row items-start justify-between rounded-md border border-rule p-4 bg-surface-sunken/40">
                        <div className="space-y-0.5 max-w-prose">
                          <FormLabel className="text-base">
                            Hide feedback until after the due date
                          </FormLabel>
                          <div className="text-sm text-ink-muted">
                            Students see only their score before the due date; full feedback unlocks afterwards.
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start date & time *</FormLabel>
                        <p className="text-xs text-ink-faint mb-2">When learners can begin taking this quiz</p>
                        <div className="space-y-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-ink-faint"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a start date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-60" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => {
                                  if (!date) {
                                    field.onChange(date);
                                    return;
                                  }
                                  const next = new Date(date);
                                  if (field.value) {
                                    next.setHours(
                                      field.value.getHours(),
                                      field.value.getMinutes(),
                                      0,
                                      0,
                                    );
                                  } else {
                                    next.setHours(0, 0, 0, 0);
                                  }
                                  field.onChange(next);
                                }}
                                disabled={(date) => {
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  return date < today;
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <Input
                            type="time"
                            placeholder="00:00"
                            value={field.value ? format(field.value, 'HH:mm') : ''}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const [hours, minutes] = e.target.value.split(':');
                              const base = field.value ? new Date(field.value) : new Date();
                              base.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
                              field.onChange(base);
                            }}
                          />
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End date & time (due date) *</FormLabel>
                        <p className="text-xs text-ink-faint mb-2">The submission deadline</p>
                        <div className="space-y-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-ink-faint"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick an end date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-60" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => {
                                  if (!date) {
                                    field.onChange(date);
                                    return;
                                  }
                                  const next = new Date(date);
                                  if (field.value) {
                                    next.setHours(
                                      field.value.getHours(),
                                      field.value.getMinutes(),
                                      0,
                                      0,
                                    );
                                  } else {
                                    next.setHours(23, 59, 0, 0);
                                  }
                                  field.onChange(next);
                                }}
                                disabled={(date) => {
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  const startDate = form.getValues('startDate');
                                  if (startDate) {
                                    const start = new Date(startDate);
                                    start.setHours(0, 0, 0, 0);
                                    return date < today || date < start;
                                  }
                                  return date < today;
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <Input
                            type="time"
                            placeholder="23:59"
                            value={field.value ? format(field.value, 'HH:mm') : ''}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const [hours, minutes] = e.target.value.split(':');
                              const base = field.value ? new Date(field.value) : new Date();
                              base.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
                              field.onChange(base);

                              const startDate = form.getValues('startDate');
                              if (startDate && base <= new Date(startDate)) {
                                form.setError('endDate', {
                                  type: 'manual',
                                  message: 'End date and time must be after start date and time',
                                });
                              } else {
                                form.clearErrors('endDate');
                              }
                            }}
                          />
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
            </section>
          )}

          {currentStep === 2 && (
            <section className="paper paper-shadow p-6 md:p-8 flex flex-col gap-6">
              <header className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <span className="eyebrow text-ink-faint">Step 2</span>
                  <h2 className="font-display text-2xl text-ink mt-1">Questions</h2>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      downloadCsvTemplate(
                        'quiz_questions_template.csv',
                        QUIZ_QUESTIONS_CSV_TEMPLATE,
                      )
                    }
                    variant="ghost"
                    size="sm"
                  >
                    Download template
                  </Button>
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    size="sm"
                  >
                    <Upload className="h-4 w-4" />
                    Upload CSV
                  </Button>
                  <Button
                    type="button"
                    onClick={addQuestion}
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                    Add question
                  </Button>
                </div>
              </header>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
              />
              {csvError && (
                <div className="text-danger text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {csvError}
                </div>
              )}
              <p className="text-xs text-ink-faint max-w-prose">
                CSV format: <code className="font-mono">question,type,options,correct_answer,points</code> · Types:
                MULTIPLE_CHOICE, TRUE_FALSE, SHORT_ANSWER · Use{" "}
                <code className="font-mono">|</code> to separate options.
              </p>

              <div className="hairline" />

              <div className="flex flex-col gap-6">
                {watchedQuestions.map((question: any, questionIndex: number) => (
                  <article
                    key={questionIndex}
                    className="border border-rule rounded-md p-5 bg-surface flex flex-col gap-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="eyebrow text-ink-faint">
                        Question {questionIndex + 1}
                      </h3>
                      {watchedQuestions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeQuestion(questionIndex)}
                          aria-label="Remove question"
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      )}
                    </div>
                    <FormField
                      control={form.control}
                      name={`questions.${questionIndex}.question`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Question text *</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter your question..."
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`questions.${questionIndex}.type`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Question type *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="MULTIPLE_CHOICE">Multiple choice</SelectItem>
                                <SelectItem value="TRUE_FALSE">True / false</SelectItem>
                                <SelectItem value="SHORT_ANSWER">Short answer</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`questions.${questionIndex}.points`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Points *</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="1"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {question.type === 'MULTIPLE_CHOICE' && (
                      <div className="flex flex-col gap-3">
                        <FormLabel>Options *</FormLabel>
                        {question.options?.map((option: string, optionIndex: number) => (
                          <div key={optionIndex} className="flex items-center gap-2">
                            <Input
                              placeholder={`Option ${optionIndex + 1}`}
                              value={option}
                              onChange={(e) => updateQuestionOptions(questionIndex, optionIndex, e.target.value)}
                            />
                            <FormField
                              control={form.control}
                              name={`questions.${questionIndex}.correctAnswer`}
                              render={({ field }) => (
                                <FormItem className="flex items-center gap-2 shrink-0">
                                  <FormControl>
                                    <input
                                      type="radio"
                                      name={`correct-${questionIndex}`}
                                      value={option}
                                      checked={field.value === option}
                                      onChange={(e) => field.onChange(e.target.value)}
                                      className="accent-brand"
                                    />
                                  </FormControl>
                                  <span className="text-xs text-ink-muted eyebrow">Correct</span>
                                </FormItem>
                              )}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {question.type === 'TRUE_FALSE' && (
                      <FormField
                        control={form.control}
                        name={`questions.${questionIndex}.correctAnswer`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Correct answer *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select correct answer" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="true">True</SelectItem>
                                <SelectItem value="false">False</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {question.type === 'SHORT_ANSWER' && (
                      <FormField
                        control={form.control}
                        name={`questions.${questionIndex}.correctAnswer`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sample answer (optional)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Enter a sample correct answer..."
                                {...field}
                                value={field.value ?? ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {currentStep === 3 && (
            <section className="paper paper-shadow p-6 md:p-8 flex flex-col gap-6">
              <header>
                <span className="eyebrow text-ink-faint">Step 3</span>
                <h2 className="font-display text-2xl text-ink mt-1">Review</h2>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="eyebrow text-ink-faint mb-3">Basics</h3>
                  <dl className="text-sm flex flex-col gap-2">
                    <div className="flex gap-2"><dt className="text-ink-muted w-32 shrink-0">Title</dt><dd className="text-ink">{form.getValues('title')}</dd></div>
                    <div className="flex gap-2"><dt className="text-ink-muted w-32 shrink-0">Description</dt><dd className="text-ink">{form.getValues('description') || '-'}</dd></div>
                    <div className="flex gap-2"><dt className="text-ink-muted w-32 shrink-0">Sections</dt><dd className="text-ink">{sectionIds.length === 0 ? '-' : sectionIds.map(id => courses.find(c => c.id === id)?.title || id).join(', ')}</dd></div>
                    <div className="flex gap-2"><dt className="text-ink-muted w-32 shrink-0">Max attempts</dt><dd className="text-ink tnum">{form.getValues('maxAttempts')}</dd></div>
                    <div className="flex gap-2"><dt className="text-ink-muted w-32 shrink-0">Time limit</dt><dd className="text-ink tnum">{form.getValues('timeLimit')} min</dd></div>
                    <div className="flex gap-2"><dt className="text-ink-muted w-32 shrink-0">Passing score</dt><dd className="text-ink tnum">{form.getValues('passingScore')}%</dd></div>
                    <div className="flex gap-2"><dt className="text-ink-muted w-32 shrink-0">Start</dt><dd className="text-ink">{format(form.getValues('startDate'), 'PPP p')}</dd></div>
                    <div className="flex gap-2"><dt className="text-ink-muted w-32 shrink-0">End</dt><dd className="text-ink">{format(form.getValues('endDate'), 'PPP p')}</dd></div>
                    <div className="flex gap-2"><dt className="text-ink-muted w-32 shrink-0">Delay feedback</dt><dd className="text-ink">{form.getValues('hideFeedbackAfterDue') ? 'Yes' : 'No'}</dd></div>
                  </dl>
                </div>
                <div>
                  <h3 className="eyebrow text-ink-faint mb-3">Questions ({watchedQuestions.length})</h3>
                  <ol className="flex flex-col gap-3 text-sm">
                    {watchedQuestions.map((question: any, index: number) => (
                      <li key={index} className="border-l-2 border-rule pl-3">
                        <p className="text-ink"><span className="text-ink-faint tnum">Q{index + 1}.</span> {question.question || <em className="text-ink-faint">Untitled</em>}</p>
                        <p className="text-xs text-ink-faint mt-1">{question.type.replace('_', ' ').toLowerCase()} · {question.points} {question.points === 1 ? 'pt' : 'pts'}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>
          )}

          <div className="flex justify-between mt-2">
            <Button
              type="button"
              onClick={prevStep}
              disabled={currentStep === 1}
              variant="outline"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Button>

            {currentStep < 3 ? (
              <Button
                type="button"
                onClick={nextStep}
                disabled={courses.length === 0}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting}
                loading={isSubmitting}
              >
                <Save className="h-4 w-4" />
                {isSubmitting ? 'Creating…' : 'Create quiz'}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
} 