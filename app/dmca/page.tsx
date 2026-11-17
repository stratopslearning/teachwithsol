import type { Metadata } from "next";

import { LegalShell } from "@/components/legal/LegalShell";
import { withBasePath } from "@/lib/basePath";
import {
  LEGAL_BRAND,
  LEGAL_DMCA_EMAIL,
  LEGAL_ENTITY,
  legalMailingLines,
} from "@/lib/marketing/legal";
import { socialMetadata, titledPage } from "@/lib/marketing/pageMeta";
import { absoluteUrl } from "@/lib/siteUrl";

const dmcaDescription =
  "Designated copyright agent and DMCA takedown notice procedures for SOL and teachwithsol.com.";

export const metadata: Metadata = {
  title: "DMCA / Copyright",
  description: dmcaDescription,
  alternates: {
    canonical: absoluteUrl("/dmca"),
  },
  ...socialMetadata({
    title: titledPage("DMCA / Copyright"),
    description: dmcaDescription,
    url: absoluteUrl("/dmca"),
  }),
};

export default function DmcaPage() {
  const address = legalMailingLines();

  return (
    <LegalShell
      title="DMCA / Copyright"
      description={`Last updated: October 27, 2026. How to notify ${LEGAL_BRAND} of alleged copyright infringement.`}
    >
      <h2>1. Designated agent</h2>
      <p>
        {LEGAL_ENTITY} (product brand: {LEGAL_BRAND}) respects intellectual
        property rights. To submit a notice of alleged copyright infringement
        under the Digital Millennium Copyright Act (17 U.S.C. § 512), contact
        our designated agent:
      </p>
      <ul>
        <li>
          <strong>Name:</strong> DMCA Agent, {LEGAL_ENTITY}
        </li>
        <li>
          <strong>Email:</strong>{" "}
          <a href={`mailto:${LEGAL_DMCA_EMAIL}`}>{LEGAL_DMCA_EMAIL}</a>
        </li>
        <li>
          <strong>Mail:</strong>
          <br />
          {address.map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
        </li>
      </ul>
      <p>
        The designated agent must also be registered with the U.S. Copyright
        Office DMCA Designated Agent Directory for safe-harbor eligibility.
        Filing is a separate Copyright Office process (nominal fee).
      </p>

      <h2>2. What to include in a takedown notice</h2>
      <p>Your written notice should include:</p>
      <ul>
        <li>
          Identification of the copyrighted work claimed to have been infringed
        </li>
        <li>
          Identification of the material claimed to be infringing, and
          information reasonably sufficient to locate it on SOL (URL, course,
          object id, or screenshot)
        </li>
        <li>
          Your contact information (name, mailing address, telephone, email)
        </li>
        <li>
          A statement that you have a good-faith belief the use is not
          authorized by the copyright owner, its agent, or the law
        </li>
        <li>
          A statement, under penalty of perjury, that the information in the
          notice is accurate and that you are the owner or authorized to act on
          behalf of the owner
        </li>
        <li>Your physical or electronic signature</li>
      </ul>

      <h2>3. Counter-notification</h2>
      <p>
        If your material was removed and you believe the removal was a mistake
        or misidentification, you may send a counter-notification to the same
        agent with the elements required by 17 U.S.C. § 512(g), including your
        consent to jurisdiction of the federal district court for your address
        (or any district where {LEGAL_ENTITY} may be found), and your signature.
      </p>

      <h2>4. Repeat infringers</h2>
      <p>
        We may terminate accounts of users who are determined to be repeat
        infringers in appropriate circumstances, consistent with institutional
        agreements and applicable law.
      </p>

      <h2>5. Related policies</h2>
      <p>
        <a href={withBasePath("/terms")}>Terms of Use</a>
        {" · "}
        <a href={withBasePath("/privacy")}>Privacy Policy</a>
        {" · "}
        <a href={withBasePath("/security")}>Security</a>
      </p>
    </LegalShell>
  );
}
