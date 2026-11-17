import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlogShell } from "@/components/blog/BlogShell";
import { CopyPageButton } from "@/components/docs/CopyPageButton";
import { DocsMarkdown } from "@/components/docs/DocsMarkdown";
import { JsonLd } from "@/components/seo/JsonLd";
import { appPath, withBasePath } from "@/lib/basePath";
import {
  buildBlogMarkdown,
  getBlogBySlug,
  getBlogMtime,
  getBlogSlugs,
  kindLabel,
} from "@/lib/marketing/blog";
import { socialMetadata, titledPage } from "@/lib/marketing/pageMeta";
import { absoluteUrl } from "@/lib/siteUrl";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogBySlug(slug);
  if (!post) return { title: "Blog" };

  const canonical = absoluteUrl(`/blog/${slug}`);
  const markdown = absoluteUrl(`/blog/${slug}.md`);
  const description =
    post.description.length >= 120
      ? post.description
      : `${post.description} Essay from the SOL blog on teachwithsol.com.`;

  return {
    title: post.title,
    description,
    alternates: {
      canonical,
      types: {
        "text/markdown": markdown,
      },
    },
    ...socialMetadata({
      title: titledPage(post.title),
      description,
      url: canonical,
      type: "article",
    }),
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getBlogBySlug(slug);
  if (!post) notFound();

  const pageUrl = absoluteUrl(`/blog/${post.slug}`);
  const mtime = getBlogMtime(post.slug);
  const copyMarkdown = buildBlogMarkdown(post);
  const dateModified = (
    post.updated
      ? new Date(post.updated)
      : mtime ?? new Date(post.date)
  ).toISOString();
  const datePublished = new Date(post.date).toISOString();

  return (
    <BlogShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.description,
          url: pageUrl,
          mainEntityOfPage: pageUrl,
          datePublished,
          dateModified,
          author: {
            "@type": "Organization",
            name: "SOL",
            url: absoluteUrl("/"),
          },
          publisher: {
            "@type": "Organization",
            name: "SOL",
            url: absoluteUrl("/"),
          },
          isPartOf: {
            "@type": "Blog",
            name: "SOL Blog",
            url: absoluteUrl("/blog"),
          },
        }}
      />
      <article className="page-rail mx-auto max-w-[42rem] px-4 py-12 md:px-8 md:py-16">
        <header className="mb-10 border-b border-rule/70 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-ink-faint">
              <Link
                href={appPath("/blog")}
                className="transition-colors hover:text-ink"
              >
                Blog
              </Link>
              <span aria-hidden>/</span>
              <span>{kindLabel(post.kind)}</span>
            </div>
            <CopyPageButton markdown={copyMarkdown} />
          </div>
          <h1
            className="mt-4 font-display text-ink text-balance"
            style={{
              fontSize: "clamp(1.875rem, 2vw + 1.2rem, 2.75rem)",
              lineHeight: 1.12,
            }}
          >
            {post.title}
          </h1>
          {post.description ? (
            <p className="mt-3 max-w-[52ch] text-base leading-relaxed text-ink-muted">
              {post.description}
            </p>
          ) : null}
          <p className="mt-4 text-sm text-ink-faint">
            <time dateTime={post.date}>{post.date}</time>
            {post.updated ? (
              <>
                {" · Updated "}
                <time dateTime={post.updated}>{post.updated}</time>
              </>
            ) : null}
            {" · "}
            <a
              href={withBasePath(`/blog/${post.slug}.md`)}
              className="underline decoration-rule underline-offset-2 hover:text-ink"
            >
              Markdown
            </a>
          </p>
        </header>

        <div className="docs-prose">
          <DocsMarkdown content={post.body} />
        </div>
      </article>
    </BlogShell>
  );
}
