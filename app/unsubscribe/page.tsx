import type { Metadata } from "next";

import { LegalShell } from "@/components/legal/LegalShell";
import { withBasePath } from "@/lib/basePath";
import {
  LEGAL_BRAND,
  LEGAL_ENTITY,
  publicPrivacyContactEmail,
  legalMailingLines,
} from "@/lib/marketing/legal";
import { absoluteUrl } from "@/lib/siteUrl";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: `How to stop ${LEGAL_BRAND} email and where we are located.`,
  alternates: {
    canonical: absoluteUrl("/unsubscribe"),
  },
};

export default function UnsubscribePage() {
  const address = legalMailingLines();

  return (
    <LegalShell
      title="Unsubscribe"
      description={`${LEGAL_BRAND} does not send marketing newsletters by default. Use this page to stop optional email or confirm where we are.`}
    >
      <h2>1. Marketing and product email</h2>
      <p>
        SOL does not email quiz results, rosters, or grades. We do not run a
        bulk marketing list from this application today. If you received a
        demo-follow-up or ops message and want no further contact, email{" "}
        <a href={`mailto:${publicPrivacyContactEmail()}?subject=Unsubscribe`}>
          {publicPrivacyContactEmail()}
        </a>{" "}
        with subject line <strong>Unsubscribe</strong> and we will remove you
        from optional outreach.
      </p>

      <h2>2. Sign-in and security email</h2>
      <p>
        Authentication messages (magic links, verification codes, security
        alerts) are sent by our auth provider so you can access your account.
        Those are transactional, not marketing. To change the email on your
        account, sign in and update your profile, or ask your institution’s SOL
        administrator.
      </p>

      <h2>3. Postal address</h2>
      <p>
        {LEGAL_ENTITY} (product brand: {LEGAL_BRAND}):
      </p>
      <p>
        {address.map((line) => (
          <span key={line}>
            {line}
            <br />
          </span>
        ))}
      </p>

      <h2>4. Related</h2>
      <p>
        <a href={withBasePath("/privacy")}>Privacy Policy</a>
        {" · "}
        <a href={withBasePath("/terms")}>Terms of Use</a>
        {" · "}
        <a href={withBasePath("/dmca")}>DMCA</a>
      </p>
    </LegalShell>
  );
}
