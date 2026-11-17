import { NextResponse } from 'next/server';

import { getKnowledgePreviewMeta } from '@/lib/knowledge/preview';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>(
  { auth: { professorApi: 'read' } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const { id } = params;
    const courseId = req.nextUrl.searchParams.get('courseId');
    const preview = await getKnowledgePreviewMeta(
      auth.user,
      id,
      courseId,
    );
    return NextResponse.json({ preview });
  },
);
