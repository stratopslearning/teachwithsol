import type { Metadata } from "next";
import Link from "next/link";

import { LegalShell } from "@/components/legal/LegalShell";
import { appPath } from "@/lib/basePath";
import { CAL_BOOKING_URL } from "@/lib/marketing/calBooking";
import { publicPrivacyContactEmail } from "@/lib/marketing/legal";
import { socialMetadata, titledPage } from "@/lib/marketing/pageMeta";
import { absoluteUrl } from "@/lib/siteUrl";

const securityDescription =
  "How SOL handles education records, FERPA posture, AI no-train controls, HECVAT for campus IT, and hosting subprocessors. Request a demo or email privacy.";

export const metadata: Metadata = {
  title: "Security",
  description: securityDescription,
  alternates: {
    canonical: absoluteUrl("/security"),
  },
  ...socialMetadata({
    title: titledPage("Security"),
    description: securityDescription,
    url: absoluteUrl("/security"),
  }),
};

export default function SecurityPage() {
  return (
    <LegalShell
      title="Security"
      description="Plain-language overview for faculty and campus IT. Last updated October 26, 2026."
    >
      <h2>Education records</h2>
      <p>
        SOL processes coursework as education records under FERPA when used by
        an institution. Rosters, attempts, scores, grading rationale, and
        discussion transcripts are role-gated. Privileged actions write to an
        append-only audit log.
      </p>

      <h2>AI and student text</h2>
      <p>
        Short-answer grading and course tutors may send minimized student text
        and rubric context to an AI subprocessor. Production configuration
        requires training on customer content disabled and Zero Data Retention
        (or the strongest no-retention option). Application code does not put
        student names, emails, or Clerk IDs in prompts.
      </p>
      <p>
        Scores are computed in application code from rubric criterion matches.
        Model output alone is not trusted as a raw numeric grade. Low-confidence
        answers wait for instructor review.
      </p>

      <h2>HECVAT</h2>
      <p>
        A HECVAT Lite vendor response is maintained for institutional review.
        Request the current packet during contracting. Supporting policies cover
        retention, incident response, subprocessors, and a FERPA rider template.
      </p>

      <h2>Hosting</h2>
      <p>
        The application runs on Vercel. Primary datastore is Neon Postgres on
        AWS. Authentication is Clerk. Details and subprocessors are listed in
        the compliance packet shared with IT.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy and campus IT questions:{" "}
        <a href={`mailto:${publicPrivacyContactEmail()}`}>{publicPrivacyContactEmail()}</a>{". For a product walkthrough or HECVAT packet, "}
        <a href={CAL_BOOKING_URL} target="_blank" rel="noopener noreferrer">
          book a demo
        </a>{"."}
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href={appPath("/privacy")}>Privacy policy</Link>
        </li>
        <li>
          <Link href={appPath("/terms")}>Terms</Link>
        </li>
        <li>
          <a
            href={CAL_BOOKING_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Request a demo / IT guide
          </a>
        </li>
      </ul>
    </LegalShell>
  );
}
