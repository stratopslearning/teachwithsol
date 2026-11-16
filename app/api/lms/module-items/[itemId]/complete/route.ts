import { NextResponse } from 'next/server';

import { route } from '@/lib/api/route';
import { markModuleItemComplete } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

export const POST = route<{ itemId: string }>({ auth: 'learner' }, async ({ params, user }) => {
  const row = await markModuleItemComplete({
    moduleItemId: params.itemId,
    studentId: user.id,
  });
  return NextResponse.json({ progress: row });
});
