import { NextResponse } from 'next/server';

import { runRolloverChecks } from '@/lib/authoring/rolloverChecks';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const GET = route<{ courseId: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const { courseId } = params;
    const result = await runRolloverChecks(auth.user, courseId);
    return NextResponse.json(result);
  },
);
