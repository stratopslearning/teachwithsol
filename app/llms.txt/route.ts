import { NextResponse } from 'next/server';

import { buildLlmsTxt } from '@/lib/marketing/docs';

export function GET() {
  return new NextResponse(buildLlmsTxt(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
