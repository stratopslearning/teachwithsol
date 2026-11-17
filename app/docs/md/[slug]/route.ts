import { NextResponse } from 'next/server';

import {
  buildDocMarkdown,
  buildDocsIndexMarkdown,
  getDocBySlug,
} from '@/lib/marketing/docs';

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { slug } = await context.params;

  if (slug === 'index') {
    return new NextResponse(buildDocsIndexMarkdown(), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
      },
    });
  }

  const doc = getDocBySlug(slug);
  if (!doc) {
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse(buildDocMarkdown(doc), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
