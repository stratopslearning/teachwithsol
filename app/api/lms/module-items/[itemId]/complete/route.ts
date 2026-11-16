import { NextRequest, NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { requireLearnerApi } from '@/lib/api/sessionAuth';
import { markModuleItemComplete } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ itemId: string }> },
) {
  try {
    const user = await requireLearnerApi();
    const { itemId } = await ctx.params;
    const row = await markModuleItemComplete({
      moduleItemId: itemId,
      studentId: user.id,
    });
    return NextResponse.json({ progress: row });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
