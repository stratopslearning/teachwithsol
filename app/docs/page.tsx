import type { Metadata } from "next";
import {
  BookOpen,
  ClipboardList,
  FileStack,
  KeyRound,
  LineChart,
  PenLine,
  Users,
} from "@/components/icons";

import { DocsLayout } from "@/components/docs/DocsLayout";
import { DocsQuickstart } from "@/components/docs/DocsQuickstart";
import { DocsShell } from "@/components/docs/DocsShell";
import { withBasePath } from "@/lib/basePath";
import { getAllDocs } from "@/lib/marketing/docs";
import { socialMetadata, titledPage } from "@/lib/marketing/pageMeta";
import { absoluteUrl } from "@/lib/siteUrl";

const docsDescription =
  "Guides for the AI teaching layer: materials, authoring, tutoring, grading, analytics, Canvas LTI, and agent access. Start with About SOL.";

export const metadata: Metadata = {
  title: "Docs",
  description: docsDescription,
  alternates: {
    canonical: absoluteUrl("/docs"),
    types: {
      "text/markdown": absoluteUrl("/docs.md"),
    },
  },
  other: {
    "llms-txt": absoluteUrl("/docs/llms.txt"),
  },
  ...socialMetadata({
    title: titledPage("Docs"),
    description: docsDescription,
    url: absoluteUrl("/docs"),
  }),
};

const CARDS = [
  {
    slug: "about-sol",
    icon: BookOpen,
    title: "About SOL",
    body: "Teaching layer for your LMS. The operating system for learning. Roles, URLs, and what SOL is not.",
  },
  {
    slug: "professor-onboarding",
    icon: ClipboardList,
    title: "Faculty onboarding",
    body: "Verify, join sections, upload materials, author and release work, enroll students.",
  },
  {
    slug: "professor-materials",
    icon: FileStack,
    title: "Course materials",
    body: "Index syllabus and notes so drafts and the tutor stay grounded in your course.",
  },
  {
    slug: "professor-authoring",
    icon: PenLine,
    title: "Authoring",
    body: "Generate an outline from materials, refine in chat, publish inactive, then release.",
  },
  {
    slug: "student-getting-started",
    icon: Users,
    title: "Student getting started",
    body: "Sign in, join with a learner code, find lessons, quizzes, tutor help, and grades.",
  },
  {
    slug: "professor-agent-access",
    icon: KeyRound,
    title: "Agent Access",
    body: "Connect Claude, ChatGPT, or Cursor to the full faculty loop through MCP.",
  },
  {
    slug: "professor-analytics",
    icon: LineChart,
    title: "Analytics",
    body: "Concept gaps and lesson completion so you know what to reteach.",
  },
] as const;

export default function DocsIndexPage() {
  const docs = getAllDocs();

  return (
    <DocsShell>
      <DocsLayout docs={docs}>
        <header>
          <p className="eyebrow text-ink-faint">Guides</p>
          <h1
            className="mt-3 font-display text-ink text-balance"
            style={{
              fontSize: "clamp(2.1rem, 3.5vw + 1rem, 3.25rem)",
              lineHeight: 1.1,
            }}
          >
            Welcome to SOL Docs.
          </h1>
          <p className="mt-4 max-w-[48ch] text-base leading-relaxed text-ink-muted md:text-lg">
            The AI teaching layer for the LMS you already use. Build from your
            materials, tutor from your course, assess with integrity, grade with
            audit trails, and see what to reteach.{" "}
            <a
              href={withBasePath("/docs/about-sol")}
              className="text-ink underline decoration-brand-soft underline-offset-2 hover:decoration-brand"
            >
              About SOL
            </a>
            {" · "}
            <a
              href={withBasePath("/docs/professor-agent-access")}
              className="text-ink underline decoration-brand-soft underline-offset-2 hover:decoration-brand"
            >
              Agent Access
            </a>
            .
          </p>
        </header>

        <DocsQuickstart
          agentUrl={absoluteUrl("/docs/professor-agent-access")}
          markdownUrl={absoluteUrl("/docs.md")}
          llmsUrl={absoluteUrl("/docs/llms.txt")}
        />

        <div className="mt-12 grid gap-3 sm:grid-cols-2">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <a
                key={card.slug}
                href={withBasePath(`/docs/${card.slug}`)}
                className="mkt-card group flex flex-col gap-3 p-6 transition-colors hover:border-rule-strong hover:bg-surface-elevated"
              >
                <Icon className="h-5 w-5 text-brand" />
                <h2
                  className="font-display text-ink group-hover:text-brand"
                  style={{
                    fontSize: "1.25rem",
                    lineHeight: 1.25,
                  }}
                >
                  {card.title}
                </h2>
                <p className="text-sm leading-relaxed text-ink-muted">
                  {card.body}
                </p>
              </a>
            );
          })}
        </div>
      </DocsLayout>
    </DocsShell>
  );
}
