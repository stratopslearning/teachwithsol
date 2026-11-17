import { NextResponse } from 'next/server';

import {
  buildBlogIndexMarkdown,
  buildBlogMarkdown,
  getBlogBySlug,
} from '@/lib/marketing/blog';

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { slug } = await context.params;

  if (slug === 'index') {
    return new NextResponse(buildBlogIndexMarkdown(), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
      },
    });
  }

  const post = getBlogBySlug(slug);
  if (!post) {
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse(buildBlogMarkdown(post), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
