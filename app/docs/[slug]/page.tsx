import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CopyPageButton } from '@/components/docs/CopyPageButton';
import { DocsLayout } from '@/components/docs/DocsLayout';
import { DocsMarkdown } from '@/components/docs/DocsMarkdown';
import { DocsShell } from '@/components/docs/DocsShell';
import { JsonLd } from '@/components/seo/JsonLd';
import { withBasePath } from '@/lib/basePath';
import { docHowToJsonLd } from '@/lib/marketing/docHowTo';
import {
  buildDocMarkdown,
  getAllDocs,
  getDocBySlug,
  getDocMtime,
  getDocSlugs,
} from '@/lib/marketing/docs';
import { socialMetadata, titledPage } from '@/lib/marketing/pageMeta';
import { absoluteUrl } from '@/lib/siteUrl';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) return { title: 'Docs' };

  const canonical = absoluteUrl(`/docs/${slug}`);
  const markdown = absoluteUrl(`/docs/${slug}.md`);
  // Root layout appends " · SOL"; drop a trailing " SOL" so we don't get "About SOL · SOL".
  const title =
    doc.title === 'About SOL'
      ? 'About'
      : doc.title.replace(/\s+SOL$/i, '').trim() || doc.title;
  const description =
    doc.description.length >= 120
      ? doc.description
      : `${doc.description} Guides for faculty and students on teachwithsol.com.`;

  return {
    title,
    description,
    alternates: {
      canonical,
      types: {
        'text/markdown': markdown,
      },
    },
    ...socialMetadata({
      title: titledPage(title),
      description,
      url: canonical,
      type: 'article',
    }),
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  const docs = getAllDocs();
  const audienceLabel = doc.audience === 'faculty' ? 'Faculty' : 'Students';
  const copyMarkdown = buildDocMarkdown(doc);
  const pageUrl = absoluteUrl(`/docs/${doc.slug}`);
  const mtime = getDocMtime(doc.slug);
  const howTo = docHowToJsonLd(doc.slug);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: doc.title,
      description: doc.description,
      url: pageUrl,
      mainEntityOfPage: pageUrl,
      dateModified: (mtime ?? new Date()).toISOString(),
      author: {
        '@type': 'Organization',
        name: 'SOL',
        url: absoluteUrl('/'),
      },
      publisher: {
        '@type': 'Organization',
        name: 'SOL',
        url: absoluteUrl('/'),
      },
      isPartOf: {
        '@type': 'WebSite',
        name: 'SOL Docs',
        url: absoluteUrl('/docs'),
      },
    },
    ...(howTo ? [howTo] : []),
  ];

  return (
    <DocsShell>
      <JsonLd data={jsonLd} />
      <DocsLayout docs={docs} activeSlug={doc.slug}>
        <article className="min-w-0">
          <header className="mb-10 border-b border-rule/70 pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-ink-faint">
                <a
                  href={withBasePath('/docs')}
                  className="transition-colors hover:text-ink"
                >
                  Docs
                </a>
                <span aria-hidden>/</span>
                <span>{audienceLabel}</span>
              </div>
              <CopyPageButton markdown={copyMarkdown} />
            </div>
            <h1
              className="mt-4 font-display text-ink text-balance"
              style={{
                fontSize: 'clamp(1.875rem, 2vw + 1.2rem, 2.75rem)',
                lineHeight: 1.12,
              }}
            >
              {doc.title}
            </h1>
            {doc.description ? (
              <p className="mt-3 max-w-[52ch] text-base leading-relaxed text-ink-muted">
                {doc.description}
              </p>
            ) : null}
          </header>

          <DocsMarkdown content={doc.body} />
        </article>
      </DocsLayout>
    </DocsShell>
  );
}
