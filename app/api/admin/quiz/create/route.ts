import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/db';
import { users } from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import {
  createQuizDefiner,
  fetchOfferingIdsForCourse,
  fetchSectionById,
  fetchSectionsByIds,
} from '@/lib/db/entityScopedReads';
import { quizCreateBaseSchema } from '@/lib/quiz/schemas';

export const dynamic = 'force-dynamic';

const createQuizSchema = quizCreateBaseSchema;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await db.query.users.findFirst({ where: eq(users.clerkId, userId) });
    if (!user || !user.platformStaff) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }
    const body = await readJsonBody(req);
    const validatedData = createQuizSchema.parse(body);

    if (!validatedData.sectionIds || validatedData.sectionIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one section must be assigned to the quiz.' },
        { status: 400 },
      );
    }

    // FORCE RLS: a plain db read finds no sections; use the definer.
    const assignedSections = await fetchSectionsByIds(validatedData.sectionIds);
    if (assignedSections.length !== validatedData.sectionIds.length) {
      return NextResponse.json({ error: 'One or more sections not found' }, { status: 404 });
    }
    const tenantId =
      assignedSections[0]?.tenantId ?? assignedSections[0]?.workspaceId ?? null;
    if (!tenantId) {
      return NextResponse.json({ error: 'Section missing tenant' }, { status: 400 });
    }
    if (
      assignedSections.some(
        (s) => (s.tenantId ?? s.workspaceId) !== tenantId,
      )
    ) {
      return NextResponse.json(
        { error: 'All sections must belong to the same tenant' },
        { status: 400 },
      );
    }
    await requireSupportGrant(
      {
        id: user.id,
        clerkId: user.clerkId,
        platformStaff: user.platformStaff,
      },
      tenantId,
      { action: 'support.tenant_access', targetType: 'workspace', targetId: tenantId },
    );

    const targetSection = await fetchSectionById(validatedData.sectionIds[0]!);
    if (!targetSection) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }
    let offeringId: string | null = targetSection.offeringId ?? null;
    if (!offeringId && targetSection.courseId) {
      const offeringIds = await fetchOfferingIdsForCourse(targetSection.courseId);
      offeringId = offeringIds[0] ?? null;
    }
    const courseId: string | null = targetSection.courseId ?? null;

    const quizId = await createQuizDefiner({
      title: validatedData.title,
      description: validatedData.description ?? null,
      professorId: user.id,
      tenantId,
      offeringId,
      courseId,
      maxAttempts: validatedData.maxAttempts,
      timeLimit: validatedData.timeLimit ?? null,
      passingScore: validatedData.passingScore,
      startDate: new Date(validatedData.startDate).toISOString(),
      endDate: new Date(validatedData.endDate).toISOString(),
      isActive: true,
      hideFeedbackAfterDue: validatedData.hideFeedbackAfterDue ?? false,
      sectionIds: validatedData.sectionIds,
      questions: validatedData.questions.map((q) => ({
        type: q.type,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        points: q.points,
        order: q.order,
      })),
    });

    return NextResponse.json({
      success: true,
      quiz: {
        id: quizId,
        title: validatedData.title,
        sectionIds: validatedData.sectionIds,
      },
    });
  } catch (error) {
    console.error('Admin quiz creation error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 });
    }
    return apiErrorResponse(error);
  }
}
