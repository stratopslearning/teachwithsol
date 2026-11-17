/**
 * One-shot DB CRUD smoke against DATABASE_URL.
 * Creates ephemeral rows, exercises create/read/update/delete (+ 0007 constraint), then cleans up.
 *
 *   npx tsx scripts/smoke-crud.ts
 */
import { config as loadEnv } from 'dotenv';
import { and, eq, isNull } from 'drizzle-orm';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

import * as schema from '../app/db/schema';
import { generateEnrollmentCode } from '../lib/utils';
import { assertDevDatabaseOrExit } from './lib/assertDevDatabase';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '.env.local', override: true, quiet: true });

assertDevDatabaseOrExit({ urlEnvVars: ['DATABASE_URL'] });

if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

const slug = () => Math.random().toString(36).slice(2, 10).toUpperCase();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('postgres')) {
    throw new Error('DATABASE_URL missing or invalid');
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  const failures: string[] = [];
  const ok = (label: string) => console.log(`  ✓ ${label}`);
  const fail = (label: string, err: unknown) => {
    failures.push(label);
    console.error(`  ✗ ${label}:`, err instanceof Error ? err.message : err);
  };

  console.log('Smoke CRUD starting…');

  let professorId = '';
  let studentId = '';
  let courseId = '';
  let sectionId = '';
  let quizId = '';
  let questionId = '';
  let assignmentId = '';
  let chatbotId = '';
  let attemptId = '';

  try {
    // --- users ---
    try {
      const [prof] = await db
        .insert(schema.users)
        .values({
          clerkId: `smoke_prof_${slug()}`,
          email: `smoke-prof-${slug()}@test.local`,
          paid: true,
        })
        .returning();
      professorId = prof.id;
      const [stu] = await db
        .insert(schema.users)
        .values({
          clerkId: `smoke_stu_${slug()}`,
          email: `smoke-stu-${slug()}@test.local`,
          paid: true,
        })
        .returning();
      studentId = stu.id;
      ok('users create');
    } catch (e) {
      fail('users create', e);
      throw e;
    }

    // --- course / section ---
    try {
      const [course] = await db
        .insert(schema.courses)
        .values({
          workspaceId: schema.DEFAULT_WORKSPACE_ID,
          tenantId: schema.DEFAULT_WORKSPACE_ID,
          title: `Smoke Course ${slug()}`,
        })
        .returning();
      courseId = course.id;

      const [section] = await db
        .insert(schema.sections)
        .values({
          courseId,
          workspaceId: schema.DEFAULT_WORKSPACE_ID,
          tenantId: schema.DEFAULT_WORKSPACE_ID,
          name: `Smoke Section ${slug()}`,
          professorEnrollmentCode: generateEnrollmentCode(),
          studentEnrollmentCode: generateEnrollmentCode(),
        })
        .returning();
      sectionId = section.id;

      await db
        .update(schema.sections)
        .set({ name: `Smoke Section Updated ${slug()}` })
        .where(eq(schema.sections.id, sectionId));

      const readSection = await db.query.sections.findFirst({
        where: eq(schema.sections.id, sectionId),
      });
      if (!readSection?.name.includes('Updated')) {
        throw new Error('section update not visible');
      }
      ok('course + section CRUD');
    } catch (e) {
      fail('course + section CRUD', e);
    }

    // --- section endsAt (conclude / reopen) ---
    try {
      const pastEnds = new Date(Date.now() - 60_000);
      await db
        .update(schema.sections)
        .set({ endsAt: pastEnds })
        .where(eq(schema.sections.id, sectionId));
      const concluded = await db.query.sections.findFirst({
        where: eq(schema.sections.id, sectionId),
      });
      if (!concluded?.endsAt) throw new Error('endsAt not persisted');
      const { isSectionConcluded } = await import('../lib/sections/availability');
      if (!isSectionConcluded(concluded)) {
        throw new Error('section should be concluded after past endsAt');
      }
      await db
        .update(schema.sections)
        .set({ endsAt: null })
        .where(eq(schema.sections.id, sectionId));
      const reopened = await db.query.sections.findFirst({
        where: eq(schema.sections.id, sectionId),
      });
      if (reopened?.endsAt != null || isSectionConcluded(reopened)) {
        throw new Error('clearing endsAt should reopen section');
      }
      ok('section endsAt conclude/reopen');
    } catch (e) {
      fail('section endsAt conclude/reopen', e);
    }

    // --- enrollments ---
    try {
      await db.insert(schema.professorSections).values({
        professorId,
        sectionId,
      });
      await db.insert(schema.studentSections).values({
        studentId,
        sectionId,
      });
      let dupBlocked = false;
      try {
        await db.insert(schema.studentSections).values({
          studentId,
          sectionId,
        });
      } catch {
        dupBlocked = true;
      }
      if (!dupBlocked) throw new Error('duplicate student enrollment allowed');
      ok('enrollments + unique constraint');
    } catch (e) {
      fail('enrollments + unique constraint', e);
    }

    // --- quiz / questions / assign ---
    try {
      const [quiz] = await db
        .insert(schema.quizzes)
        .values({
          title: `Smoke Quiz ${slug()}`,
          professorId,
          maxAttempts: 2,
          passingScore: 60,
        })
        .returning();
      quizId = quiz.id;

      const [question] = await db
        .insert(schema.questions)
        .values({
          quizId,
          type: 'MULTIPLE_CHOICE',
          question: 'Smoke Q?',
          options: ['a', 'b'],
          correctAnswer: 'a',
          points: 1,
          order: 0,
        })
        .returning();
      questionId = question.id;

      await db
        .update(schema.quizzes)
        .set({ title: `Smoke Quiz Updated ${slug()}` })
        .where(eq(schema.quizzes.id, quizId));

      await db.insert(schema.quizSections).values({
        quizId,
        sectionId,
        assignedBy: professorId,
      });

      await db.delete(schema.quizSections).where(
        and(
          eq(schema.quizSections.quizId, quizId),
          eq(schema.quizSections.sectionId, sectionId),
        ),
      );
      await db.insert(schema.quizSections).values({
        quizId,
        sectionId,
        assignedBy: professorId,
      });

      ok('quiz + question + assign/unassign');
    } catch (e) {
      fail('quiz + question + assign/unassign', e);
    }

    // --- assignment + attempts (0007) ---
    try {
      const [assignment] = await db
        .insert(schema.assignments)
        .values({ quizId, studentId })
        .returning();
      assignmentId = assignment.id;

      const [open] = await db
        .insert(schema.attempts)
        .values({
          assignmentId,
          studentId,
          quizId,
          sectionId,
          answers: {},
          maxScore: 1,
          startedAt: new Date(),
        })
        .returning();
      attemptId = open.id;

      let oneOpenBlocked = false;
      try {
        await db.insert(schema.attempts).values({
          assignmentId,
          studentId,
          quizId,
          sectionId,
          answers: {},
          maxScore: 1,
          startedAt: new Date(),
        });
      } catch {
        oneOpenBlocked = true;
      }
      if (!oneOpenBlocked) {
        throw new Error('0007 one-open unique index not enforcing');
      }

      await db
        .update(schema.attempts)
        .set({
          answers: { [questionId]: 'a' },
          submittedAt: new Date(),
          score: 1,
          percentage: 100,
        })
        .where(eq(schema.attempts.id, attemptId));

      const [second] = await db
        .insert(schema.attempts)
        .values({
          assignmentId,
          studentId,
          quizId,
          sectionId,
          answers: {},
          maxScore: 1,
          startedAt: new Date(),
        })
        .returning();

      await db.delete(schema.attempts).where(eq(schema.attempts.id, second.id));
      ok('assignment + attempts + 0007 one-open');
    } catch (e) {
      fail('assignment + attempts + 0007 one-open', e);
    }

    // --- chatbot ---
    try {
      const [bot] = await db
        .insert(schema.chatbots)
        .values({
          title: `Smoke Bot ${slug()}`,
          professorId,
          instructions: 'Guide the student with Socratic questions.',
          systemPrompt: 'You are a smoke-test tutor.',
          isActive: true,
        })
        .returning();
      chatbotId = bot.id;

      await db
        .update(schema.chatbots)
        .set({ title: `Smoke Bot Updated ${slug()}` })
        .where(eq(schema.chatbots.id, chatbotId));

      await db.insert(schema.chatbotSections).values({
        chatbotId,
        sectionId,
        assignedBy: professorId,
      });
      await db.delete(schema.chatbotSections).where(
        and(
          eq(schema.chatbotSections.chatbotId, chatbotId),
          eq(schema.chatbotSections.sectionId, sectionId),
        ),
      );
      ok('chatbot create/update/assign/unassign');
    } catch (e) {
      fail('chatbot create/update/assign/unassign', e);
    }

    // --- email uniqueness + admin-style user delete reassignment ---
    try {
      const email = `smoke-dup-${slug()}@test.local`;
      const [u1] = await db
        .insert(schema.users)
        .values({
          clerkId: `smoke_dup_a_${slug()}`,
          email,
          paid: false,
        })
        .returning();
      let dupBlocked = false;
      try {
        await db.insert(schema.users).values({
          clerkId: `smoke_dup_b_${slug()}`,
          email,
          paid: false,
        });
      } catch {
        dupBlocked = true;
      }
      if (!dupBlocked) {
        throw new Error('expected unique email index to block duplicate insert');
      }

      const [admin] = await db
        .insert(schema.users)
        .values({
          clerkId: `smoke_admin_${slug()}`,
          email: `smoke-admin-${slug()}@test.local`,
          platformStaff: true,
          paid: true,
        })
        .returning();

      const [ownedQuiz] = await db
        .insert(schema.quizzes)
        .values({
          title: `Smoke Owned ${slug()}`,
          professorId: u1.id,
          maxAttempts: 1,
          passingScore: 60,
          isActive: true,
        })
        .returning();

      // Simulate admin delete reassignment then user delete
      await db
        .update(schema.quizzes)
        .set({ professorId: admin.id })
        .where(eq(schema.quizzes.professorId, u1.id));
      await db.delete(schema.users).where(eq(schema.users.id, u1.id));
      const gone = await db.query.users.findFirst({
        where: eq(schema.users.id, u1.id),
      });
      if (gone) throw new Error('user still present after delete');
      const reassigned = await db.query.quizzes.findFirst({
        where: eq(schema.quizzes.id, ownedQuiz.id),
      });
      if (reassigned?.professorId !== admin.id) {
        throw new Error('quiz was not reassigned to admin');
      }

      await db.delete(schema.quizzes).where(eq(schema.quizzes.id, ownedQuiz.id));
      await db.delete(schema.users).where(eq(schema.users.id, admin.id));
      ok('email unique + user delete reassignment');
    } catch (e) {
      fail('email unique + user delete reassignment', e);
    }

    // --- soft-delete quiz ---
    try {
      await db
        .update(schema.quizzes)
        .set({ deletedAt: new Date(), isActive: false })
        .where(eq(schema.quizzes.id, quizId));
      const hidden = await db.query.quizzes.findFirst({
        where: and(
          eq(schema.quizzes.id, quizId),
          isNull(schema.quizzes.deletedAt),
        ),
      });
      if (hidden) throw new Error('soft-deleted quiz still active-visible');
      ok('quiz soft-delete');
    } catch (e) {
      fail('quiz soft-delete', e);
    }
  } finally {
    // cleanup (order matters for FKs)
    try {
      if (attemptId) {
        await db.delete(schema.attempts).where(eq(schema.attempts.assignmentId, assignmentId));
      }
      if (assignmentId) {
        await db.delete(schema.assignments).where(eq(schema.assignments.id, assignmentId));
      }
      if (chatbotId) {
        await db
          .delete(schema.chatbotSections)
          .where(eq(schema.chatbotSections.chatbotId, chatbotId));
        await db.delete(schema.chatbots).where(eq(schema.chatbots.id, chatbotId));
      }
      if (quizId) {
        await db.delete(schema.quizSections).where(eq(schema.quizSections.quizId, quizId));
        await db.delete(schema.questions).where(eq(schema.questions.quizId, quizId));
        await db.delete(schema.quizzes).where(eq(schema.quizzes.id, quizId));
      }
      if (sectionId) {
        await db
          .delete(schema.studentSections)
          .where(eq(schema.studentSections.sectionId, sectionId));
        await db
          .delete(schema.professorSections)
          .where(eq(schema.professorSections.sectionId, sectionId));
        await db.delete(schema.sections).where(eq(schema.sections.id, sectionId));
      }
      if (courseId) {
        await db.delete(schema.courses).where(eq(schema.courses.id, courseId));
      }
      if (studentId) {
        await db.delete(schema.users).where(eq(schema.users.id, studentId));
      }
      if (professorId) {
        await db.delete(schema.users).where(eq(schema.users.id, professorId));
      }
      ok('cleanup');
    } catch (e) {
      fail('cleanup', e);
    }
    await pool.end();
  }

  if (failures.length) {
    console.error(`\nSmoke FAILED (${failures.length}): ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nSmoke CRUD passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
