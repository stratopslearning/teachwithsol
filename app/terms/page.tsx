import type { Metadata } from 'next';

import { LegalShell } from '@/components/legal/LegalShell';
import { withBasePath } from '@/lib/basePath';
import { socialMetadata, titledPage } from '@/lib/marketing/pageMeta';
import { absoluteUrl } from '@/lib/siteUrl';

const termsDescription =
  'Terms governing use of the SOL coursework platform by institutions, faculty, and students on teachwithsol.com.';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: termsDescription,
  alternates: {
    canonical: absoluteUrl('/terms'),
  },
  ...socialMetadata({
    title: titledPage('Terms of Use'),
    description: termsDescription,
    url: absoluteUrl('/terms'),
  }),
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Use"
      description="Last updated: August 12, 2026. By accessing or using SOL, you agree to these terms."
    >
      <h2>1. The service</h2>
      <p>
        SOL is a coursework platform that helps institutions deliver quizzes,
        discussions, gradebooks, and related teaching workflows, including
        optional AI-assisted grading. Features available to you depend on your
        role and your institution’s configuration.
      </p>

      <h2>2. Accounts and eligibility</h2>
      <p>
        You must be at least 13 years old to create an account. SOL is intended
        for higher-education and adult learners in institutional deployments.
        You must use an account issued or authorized for your institution
        (typically a school email). You are responsible for safeguarding your
        credentials and for activity under your account. New accounts default to
        the student role until an authorized administrator promotes faculty
        accounts.
      </p>

      <h2>3. Institutional relationship</h2>
      <p>
        When SOL is provided under an institutional agreement, that agreement
        (including any FERPA / data-processing rider) governs education-record
        handling and may supersede conflicting general terms for institutional
        deployments. Individual users must also follow their institution’s
        acceptable-use and academic-integrity policies.
      </p>

      <h2>4. Acceptable use</h2>
      <ul>
        <li>Do not attempt to access another user’s data without authorization</li>
        <li>Do not share faculty enrolment codes publicly</li>
        <li>
          Do not exfiltrate education records (rosters, grades, exports) except
          as permitted by your institution
        </li>
        <li>Do not probe, disrupt, or reverse engineer the service unlawfully</li>
        <li>
          Do not use Agent Access / API tokens to bypass institutional policy
        </li>
      </ul>

      <h2>5. Faculty exports</h2>
      <p>
        Faculty may download CSV grade exports over an authenticated session.
        Those files can contain restricted education records. You must store,
        transmit, and dispose of them according to institutional restricted-data
        rules (for example: encrypt at rest, do not email in plaintext, delete
        when no longer needed).
      </p>

      <h2>6. AI features</h2>
      <p>
        AI grading and discussion features produce assistance for faculty and
        students; faculty remain responsible for final academic judgments.
        Model-generated rationale is part of the education record when stored
        with an attempt.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        SOL and its branding, software, and documentation remain the property of
        SOL Learning and its licensors. Course content you upload remains subject
        to your and your institution’s rights; you grant SOL a limited license to
        host and process that content to operate the service. Copyright
        complaints are handled under our{" "}
        <a href={withBasePath('/dmca')}>DMCA / Copyright</a> policy.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The service is provided “as is” to the maximum extent permitted by law.
        We do not warrant uninterrupted or error-free operation. Institutional
        agreements may provide specific SLAs or remedies.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, SOL Learning is not liable for
        indirect, incidental, special, or consequential damages arising from use
        of the service. Aggregate liability is limited as stated in the
        applicable institutional agreement, or if none, to fees paid for the
        service in the twelve months before the claim.
      </p>

      <h2>10. Suspension and termination</h2>
      <p>
        We may suspend access for security abuse, non-payment (when applicable),
        or material breach. Institutions may request account or record deletion
        per the data-retention and FERPA procedures in the governing agreement.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these terms by posting a revised version on this page.
        Continued use after the effective date constitutes acceptance, except
        where an institutional agreement requires a different change process.
      </p>

      <h2>12. Fees and renewal (when paywall enabled)</h2>
      <p>
        When individual payment is enabled, charges are disclosed on the payment
        page next to the pay control. Unless the checkout page expressly states
        otherwise, enrolment fees are one-time for the stated term:{' '}
        <strong>no automatic renewal</strong> and no recurring subscription.
        Refund timing (for example a 14-day window) is as stated on the payment
        page at the time of purchase.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions:{' '}
        <a href={withBasePath('/docs')}>product docs</a>, your institution’s SOL
        administrator, or the operations contact in your agreement. Privacy:{' '}
        <a href={withBasePath('/privacy')}>Privacy Policy</a>. Copyright:{' '}
        <a href={withBasePath('/dmca')}>DMCA</a>.
      </p>
    </LegalShell>
  );
}