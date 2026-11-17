import { ApiError } from '@/lib/api/errors';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

/** Student self-leave is disabled. Instructors drop learners from the roster. */
export const POST = route<{ sectionId: string }>({ auth: 'learningArea' }, async () => {
  throw ApiError.forbidden(
    'You cannot leave this section yourself. Contact your instructor if you need to be removed.',
  );
});
