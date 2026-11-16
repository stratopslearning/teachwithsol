import type { Metadata } from "next";
import Link from "next/link";

import { BlogShell } from "@/components/blog/BlogShell";
import { appPath, withBasePath } from "@/lib/basePath";
import {
  getAllBlogPosts,
  kindLabel,
  type BlogMeta,
} from "@/lib/blog";
import { socialMetadata, titledPage } from "@/lib/pageMeta";
import { absoluteUrl } from "@/lib/siteUrl";

const blogDescription =
  "Product essays and comparisons for SOL, the AI teaching layer: where it wins against ChatGPT and quiz-only tools, how grading stays auditable, and when a teaching layer is the right fit.";

export const metadata: Metadata = {
  title: "Blog",
  description: blogDescription,
  alternates: {
    canonical: absoluteUrl("/blog"),
    types: {
      "text/markdown": absoluteUrl("/blog.md"),
    },
  },
  ...socialMetadata({
    title: titledPage("Blog"),
    description: blogDescription,
    url: absoluteUrl("/blog"),
  }),
};

function PostCard({ post }: { post: BlogMeta }) {
  return (
    <li>
      <Link
        href={appPath(`/blog/${post.slug}`)}
        className="group block border-b border-rule/60 py-6 transition-colors hover:border-ink/30"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-faint">
          <span>{kindLabel(post.kind)}</span>
          <span aria-hidden>·</span>
          <time dateTime={post.date}>{post.date}</time>
        </div>
        <h2 className="mt-2 font-display text-xl text-ink text-balance transition-colors group-hover:text-brand md:text-2xl">
          {post.title}
        </h2>
        <p className="mt-2 max-w-[52ch] text-base leading-relaxed text-ink-muted">
          {post.description}
        </p>
      </Link>
    </li>
  );
}

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();
  const comparisons = posts.filter((p) => p.kind === "vs");
  const deepDives = posts.filter((p) => p.kind !== "vs");

  return (
    <BlogShell>
      <div className="page-rail mx-auto max-w-[42rem] px-4 py-12 md:px-8 md:py-16">
        <header className="mb-12 border-b border-rule/70 pb-8">
          <p className="eyebrow text-ink-faint">Blog</p>
          <h1
            className="mt-3 font-display text-ink text-balance"
            style={{
              fontSize: "clamp(1.9rem, 2vw + 1.2rem, 2.75rem)",
              lineHeight: 1.12,
            }}
          >
            Product essays and comparisons.
          </h1>
          <p className="mt-4 max-w-[48ch] text-base leading-relaxed text-ink-muted">
            Where SOL wins as a teaching layer, where ChatGPT or an LMS still
            fit better, and how the loop actually works. Written for faculty and
            campus IT.
          </p>
          <p className="mt-3 text-sm text-ink-faint">
            <a
              href={withBasePath("/blog.md")}
              className="underline decoration-rule underline-offset-2 hover:text-ink"
            >
              Markdown index
            </a>
            {" · "}
            <Link
              href={appPath("/docs")}
              className="underline decoration-rule underline-offset-2 hover:text-ink"
            >
              Docs
            </Link>
          </p>
        </header>

        {comparisons.length > 0 ? (
          <section className="mb-14">
            <h2 className="font-display text-lg text-ink">Comparisons</h2>
            <ul className="mt-2">
              {comparisons.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </ul>
          </section>
        ) : null}

        {deepDives.length > 0 ? (
          <section>
            <h2 className="font-display text-lg text-ink">
              Product deep dives
            </h2>
            <ul className="mt-2">
              {deepDives.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </ul>
          </section>
        ) : null}

        {posts.length === 0 ? (
          <p className="text-ink-muted">No posts yet.</p>
        ) : null}
      </div>
    </BlogShell>
  );
}
