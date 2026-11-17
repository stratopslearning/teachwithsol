import type { Metadata } from 'next';

import { SEO } from '@/lib/marketing/seo';

/** Shared Open Graph + Twitter card fields so pages do not inherit homepage cards. */
export function socialMetadata(opts: {
  title: string;
  description: string;
  url: string;
  type?: 'website' | 'article';
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const { title, description, url, type = 'website' } = opts;
  return {
    openGraph: {
      title,
      description,
      url,
      siteName: SEO.brand,
      type,
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

/** Absolute document title shown in OG (matches root template “{title} · SOL”). */
export function titledPage(title: string): string {
  if (title === SEO.brand || title.startsWith(`${SEO.brand} ·`)) return title;
  return `${title} · ${SEO.brand}`;
}
