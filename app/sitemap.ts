import type { MetadataRoute } from 'next';

import { getAllBlogPosts, getBlogMtime } from '@/lib/marketing/blog';
import { getAllDocs, getDocMtime } from '@/lib/marketing/docs';
import { absoluteUrl } from '@/lib/siteUrl';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const docs = getAllDocs();
  const posts = getAllBlogPosts();

  const entries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteUrl('/docs'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/blog'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: absoluteUrl('/security'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: absoluteUrl('/privacy'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: absoluteUrl('/terms'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: absoluteUrl('/dmca'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  for (const doc of docs) {
    entries.push({
      url: absoluteUrl(`/docs/${doc.slug}`),
      lastModified: getDocMtime(doc.slug) ?? now,
      changeFrequency: 'monthly',
      priority: doc.slug === 'about-sol' ? 0.85 : 0.8,
    });
  }

  for (const post of posts) {
    entries.push({
      url: absoluteUrl(`/blog/${post.slug}`),
      lastModified: getBlogMtime(post.slug) ?? now,
      changeFrequency: 'monthly',
      priority: post.kind === 'vs' ? 0.84 : 0.82,
    });
  }

  return entries;
}
