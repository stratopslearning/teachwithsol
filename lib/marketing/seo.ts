import { solDemoOnly } from '@/lib/solHosts';
import { absoluteUrl, siteOrigin } from '@/lib/siteUrl';

/** Shared marketing SEO / AIO copy. */
export const SEO = {
  brand: 'SOL',
  productName: 'SOL',
  tagline: 'The operating system for teaching',
  /** Under ~155 chars: primary meta + Open Graph description (fits Google snippets). */
  description:
    'SOL is the AI teaching layer for the LMS you already use. Turn your materials into courses, practice, and tutoring.',
  /** Slightly shorter social/subtitle line; still keyword-forward. */
  shortDescription:
    'The AI teaching layer for your LMS. Courses, practice, and tutoring from your materials.',
  keywords: [
    'SOL',
    'teach with SOL',
    'teachwithsol',
    'AI teaching layer',
    'AI for Canvas',
    'Canvas AI tutoring',
    'AI course authoring',
    'AI quiz grading',
    'higher education AI',
    'LMS teaching layer',
    'operating system for teaching',
  ],
} as const;

/**
 * Optional Organization sameAs URLs (comma-separated), e.g. LinkedIn company page.
 * Example: NEXT_PUBLIC_SOL_SAME_AS=https://www.linkedin.com/company/teachwithsol
 */
export function organizationSameAs(): string[] {
  const raw = process.env.NEXT_PUBLIC_SOL_SAME_AS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
}

export function seoMetadataBase(): URL {
  return new URL(`${siteOrigin()}/`);
}

export function primaryPublicUrl(): string {
  return absoluteUrl('/');
}

/** Extra brand signals when serving the teachwithsol marketing deploy. */
export function brandAliases(): string[] {
  if (!solDemoOnly()) return ['SOL'];
  return ['SOL', 'teachwithsol', 'Teach with SOL', 'teachwithsol.com'];
}
