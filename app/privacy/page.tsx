import type { Metadata } from 'next';

import { LegalShell } from '@/components/legal/LegalShell';
import { withBasePath } from '@/lib/basePath';
import {
  LEGAL_ENTITY,
  publicPrivacyContactEmail,
  legalMailingLines,
} from '@/lib/marketing/legal';
import { socialMetadata, titledPage } from '@/lib/marketing/pageMeta';
import { absoluteUrl } from '@/lib/siteUrl';

const privacyDescription =
  'How SOL collects, uses, retains, and protects education records and account data for faculty, students, and institutions.';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: privacyDescription,
  alternates: {
    canonical: absoluteUrl('/privacy'),
  },
  ...socialMetadata({
    title: titledPage('Privacy Policy'),
    description: privacyDescription,
    url: absoluteUrl('/privacy'),
  }),
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      description="Last updated: August 12, 2026. This policy describes how SOL Learning (“SOL,” “we”) handles personal information and education records when you use the SOL application."
    >
      <h2>1. Who this policy covers</h2>
      <p>
        This policy applies to students, faculty, and administrators who use SOL
        at participating institutions, and to visitors of our public marketing
        and documentation pages.
      </p>

      <h2>2. Education records (FERPA)</h2>
      <p>
        When SOL is used for coursework, we process <strong>education records</strong>{' '}
        on behalf of the institution: for example section rosters, quiz
        attempts, scores, AI grading rationale, discussion transcripts, and
        related audit events. Under FERPA, the institution is typically the
        education agency/institution; SOL acts as a service provider /
        “school official” only under a written agreement with that institution
        (see our FERPA rider template shared during contracting).
      </p>
      <p>
        Student rights to inspect, amend, or request deletion of education
        records are exercised <strong>through the institution</strong>. SOL
        executes institution-directed access, amendment, or purge requests
        using admin tools and documented retention procedures.
      </p>

      <h2>3. Information we collect</h2>
      <ul>
        <li>
          <strong>Account data:</strong> name, email, authentication identifiers
          (via Clerk), role (student / professor / admin), and payment status
          when the paywall is enabled.
        </li>
        <li>
          <strong>Coursework data:</strong> enrollments, quiz content and
          attempts, grades, discussion sessions, and faculty exports initiated
          in-product.
        </li>
        <li>
          <strong>Technical data:</strong> IP address and user-agent on
          security-relevant audit events; error diagnostics via Sentry (PII
          scrubbing defaults in production; <strong>session replay is off</strong>);
          rate-limit counters in Upstash.
        </li>
      </ul>

      <h2>4. How we use information</h2>
      <ul>
        <li>Provide authentication, coursework, grading, and faculty tools</li>
        <li>Enforce role-based access and section-scoped visibility</li>
        <li>Operate AI-assisted grading and discussion features (see §6)</li>
        <li>Maintain security, audit, fraud prevention, and rate limiting</li>
        <li>Process payments when the institution enables the paywall (Stripe)</li>
        <li>Comply with law and institutional contracts</li>
      </ul>
      <p>
        SOL does <strong>not</strong> email quiz results, rosters, or grades.
        Auth emails (sign-in / verification) are sent by our authentication
        provider and do not include education-record grade content.
      </p>

      <h2>5. Subprocessors</h2>
      <p>
        We use vetted subprocessors to operate SOL. Current categories include
        authentication (Clerk), hosting (Vercel), database (Neon), AI inference
        (OpenAI), payments (Stripe, when enabled), rate limiting (Upstash), and
        error monitoring (Sentry). A maintained inventory lives in our
        compliance binder for institutional review under NDA.
      </p>

      <h2>6. Artificial intelligence</h2>
      <p>
        Short-answer grading and discussion bots may send minimized student
        text (answers / transcripts) and rubric context to OpenAI. We require
        production configuration that disables training on customer content and
        uses the strongest available retention controls (Zero Data Retention /
        equivalent). Application code avoids sending student name, email, or
        account IDs in model prompts.
      </p>

      <h2>7. Retention and deletion</h2>
      <p>
        Default retention for active coursework data is the active term plus
        three years, unless an institution contract specifies otherwise. Soft-
        deleted catalog objects can be hard-purged by administrators.
        Institutions may request purge of specific education records; we
        document completion in the audit log. Audit logs are retained for at
        least one year (prefer three).
      </p>

      <h2>8. Security</h2>
      <p>
        SOL uses HTTPS/TLS in transit, encryption at rest for the primary
        database (provider-managed), role-based access control, security
        headers, production rate limiting, and an append-only audit log for
        sensitive actions (including gradebook views and grade exports). Faculty
        CSV exports are delivered over an authenticated HTTPS session; files
        downloaded to local devices should be stored and disposed of according
        to institutional restricted-data rules.
      </p>

      <h2>9. Sharing</h2>
      <p>
        We do not sell personal information. We share data with subprocessors
        under contract, with the institution that licensed SOL, when required by
        law, or to protect the security of users and the service.
      </p>

      <h2>10. Children</h2>
      <p>
        SOL is designed for higher-education and adult learners in institutional
        deployments. It is not directed at children under 13. Sign-up requires
        confirmation that the user is at least 13 years old.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this policy. Material changes will be reflected by updating
        the “Last updated” date on this page. Institutional contracts control
        where they conflict with this general policy for education records.
      </p>

      <h2>12. Contact</h2>
      <p>
        Privacy and education-record requests: contact your institution’s SOL
        administrator, email{' '}
        <a href={`mailto:${publicPrivacyContactEmail()}`}>{publicPrivacyContactEmail()}</a>, or
        the operations contact named in your institution’s agreement with SOL.
        Optional email outreach:{" "}
        <a href={withBasePath('/unsubscribe')}>Unsubscribe</a>.
      </p>
      <p>
        {LEGAL_ENTITY}:
        <br />
        {legalMailingLines().map((line) => (
          <span key={line}>
            {line}
            <br />
          </span>
        ))}
      </p>
      <p>
        Product documentation: <a href={withBasePath('/docs')}>Docs</a>. Terms:{' '}
        <a href={withBasePath('/terms')}>Terms</a>. Copyright:{' '}
        <a href={withBasePath('/dmca')}>DMCA</a>.
      </p>
    </LegalShell>
  );
}
