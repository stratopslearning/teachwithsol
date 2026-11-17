import fs from 'node:fs';
import path from 'node:path';

import { absoluteUrl } from '@/lib/siteUrl';

export type BlogKind = 'product' | 'vs' | 'deep-dive';
export type BlogAudience = 'faculty' | 'campus-it' | 'both';

export type BlogMeta = {
  slug: string;
  title: string;
  description: string;
  audience: BlogAudience;
  kind: BlogKind;
  order: number;
  date: string;
  updated?: string;
};

export type BlogPost = BlogMeta & {
  body: string;
};

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: raw };
  }

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }

  return { data, body: match[2].trimStart() };
}

function toMeta(slug: string, data: Record<string, string>): BlogMeta {
  const kindRaw = data.kind ?? 'product';
  const kind: BlogKind =
    kindRaw === 'vs' || kindRaw === 'deep-dive' ? kindRaw : 'product';
  const audienceRaw = data.audience ?? 'faculty';
  const audience: BlogAudience =
    audienceRaw === 'campus-it' || audienceRaw === 'both'
      ? audienceRaw
      : 'faculty';
  const order = Number.parseInt(data.order ?? '0', 10);
  return {
    slug,
    title: data.title ?? slug,
    description: data.description ?? '',
    audience,
    kind,
    order: Number.isFinite(order) ? order : 0,
    date: data.date ?? new Date().toISOString().slice(0, 10),
    updated: data.updated || undefined,
  };
}

export function getAllBlogPosts(): BlogMeta[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const slug = file.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
      const { data } = parseFrontmatter(raw);
      return toMeta(slug, data);
    })
    .sort((a, b) => a.order - b.order || b.date.localeCompare(a.date));
}

export function getBlogBySlug(slug: string): BlogPost | null {
  const filePath = path.join(BLOG_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const stripped = body.replace(/^#\s+[^\n]+\n+/, '');
  return { ...toMeta(slug, data), body: stripped };
}

export function getBlogSlugs(): string[] {
  return getAllBlogPosts().map((post) => post.slug);
}

export function getBlogMtime(slug: string): Date | null {
  const filePath = path.join(BLOG_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).mtime;
}

export function buildBlogMarkdown(post: {
  title: string;
  description: string;
  body: string;
}): string {
  const parts = [`# ${post.title}`, ''];
  if (post.description) {
    parts.push(post.description, '');
  }
  parts.push(post.body.trim(), '');
  return parts.join('\n');
}

export function buildBlogIndexMarkdown(): string {
  const posts = getAllBlogPosts();
  const comparisons = posts.filter((p) => p.kind === 'vs');
  const deepDives = posts.filter((p) => p.kind !== 'vs');

  const lines = [
    '# SOL Blog',
    '',
    'Product essays and comparisons for the AI teaching layer: where SOL wins, where it does not, and how the teaching loop works.',
    '',
    `HTML index: ${absoluteUrl('/blog')}`,
    '',
  ];

  if (comparisons.length > 0) {
    lines.push('## Comparisons', '');
    for (const post of comparisons) {
      lines.push(
        `- [${post.title}](${absoluteUrl(`/blog/${post.slug}.md`)}): ${post.description}`,
      );
    }
    lines.push('');
  }

  if (deepDives.length > 0) {
    lines.push('## Product deep dives', '');
    for (const post of deepDives) {
      lines.push(
        `- [${post.title}](${absoluteUrl(`/blog/${post.slug}.md`)}): ${post.description}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Blog section lines for site-wide llms.txt. */
export function blogLlmsEntries(): string[] {
  const posts = getAllBlogPosts();
  if (posts.length === 0) return [];

  const lines = ['## Blog', ''];
  for (const post of posts) {
    lines.push(
      `- [${post.title}](${absoluteUrl(`/blog/${post.slug}.md`)}): ${post.description}`,
    );
  }
  lines.push(
    '',
    `- [Blog HTML index](${absoluteUrl('/blog')}): Product essays and comparisons.`,
    `- [Blog markdown index](${absoluteUrl('/blog.md')}): All posts as a markdown list.`,
    '',
  );
  return lines;
}

export function kindLabel(kind: BlogKind): string {
  if (kind === 'vs') return 'Comparison';
  if (kind === 'deep-dive') return 'Deep dive';
  return 'Product';
}
