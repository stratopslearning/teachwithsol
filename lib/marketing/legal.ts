import { privacyEmailEnabled, solHostsConfigured } from "@/lib/solHosts";

/**
 * Legal entity + contact facts used on public pages, footers, and email footers.
 *
 * Set these env vars for production (CAN-SPAM + DMCA designated-agent filing need a
 * real U.S. postal address):
 *   NEXT_PUBLIC_LEGAL_STREET      e.g. "123 Example Ave, Suite 100"
 *   NEXT_PUBLIC_LEGAL_CITY_LINE   e.g. "San Francisco, CA 94105"
 *   NEXT_PUBLIC_LEGAL_ENTITY      e.g. "Your Co, Inc." (Delaware C corp when formed)
 *   NEXT_PUBLIC_LEGAL_DMCA_EMAIL  e.g. "dmca@teachwithsol.com"
 *   NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL
 */

/** Contracting / DMCA entity. Prefer env once the C corp exists; do not invent an LLC name. */
export const LEGAL_ENTITY =
  process.env.NEXT_PUBLIC_LEGAL_ENTITY?.trim() || "SOL";
export const LEGAL_BRAND = "SOL";

const street = (process.env.NEXT_PUBLIC_LEGAL_STREET || "").trim();
const cityLine = (process.env.NEXT_PUBLIC_LEGAL_CITY_LINE || "").trim();

/** Postal lines for footers / email. Empty street means address not configured yet. */
export function legalMailingLines(): string[] {
  const lines: string[] = [];
  // Avoid repeating brand when entity defaults to "SOL".
  if (LEGAL_ENTITY && LEGAL_ENTITY !== LEGAL_BRAND) {
    lines.push(LEGAL_ENTITY);
  }
  if (street) lines.push(street);
  if (cityLine) lines.push(cityLine);
  if (!street && !cityLine) {
    lines.push("United States");
  }
  return lines;
}

export function hasConfiguredMailingAddress(): boolean {
  return Boolean(street && cityLine);
}

function defaultLegalEmail(local: "dmca" | "privacy"): string {
  const host = solHostsConfigured() ? "teachwithsol.com" : "strat-ops.net";
  return `${local}@${host}`;
}

export const LEGAL_DMCA_EMAIL =
  process.env.NEXT_PUBLIC_LEGAL_DMCA_EMAIL?.trim() || defaultLegalEmail("dmca");

export const LEGAL_PRIVACY_EMAIL =
  process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL?.trim() ||
  defaultLegalEmail("privacy");

/**
 * Public founders inbox. Render it when `foundersContactEnabled()` is true
 * (local TeachWithSol and production teachwithsol.com).
 */
export const FOUNDERS_EMAIL = "founders@teachwithsol.com";

/** Address shown for privacy requests. TeachWithSol uses the founders inbox. */
export function publicPrivacyContactEmail(): string {
  return privacyEmailEnabled() ? LEGAL_PRIVACY_EMAIL : FOUNDERS_EMAIL;
}

function unsubscribeLine(opts?: { unsubscribeUrl?: string }): string {
  if (opts?.unsubscribeUrl) {
    return `Unsubscribe: ${opts.unsubscribeUrl}`;
  }
  return "You received this because of a SOL invite or account activity. To unsubscribe, reply UNSUBSCRIBE.";
}

/** Plain-text CAN-SPAM footer for transactional email. */
export function emailComplianceFooter(opts?: {
  unsubscribeUrl?: string;
}): string {
  const address = legalMailingLines().join("\n");
  const brandLine =
    LEGAL_ENTITY && LEGAL_ENTITY !== LEGAL_BRAND
      ? `${LEGAL_BRAND} · ${LEGAL_ENTITY}`
      : LEGAL_BRAND;
  const parts = [`\n—\n${brandLine}`];
  if (address) parts.push(address);
  parts.push(unsubscribeLine(opts));
  return `${parts.join("\n")}\n`;
}

/** HTML CAN-SPAM footer matching transactional email chrome. */
export function emailComplianceFooterHtml(opts?: {
  unsubscribeUrl?: string;
}): string {
  const addressLines = legalMailingLines();
  const brandLine =
    LEGAL_ENTITY && LEGAL_ENTITY !== LEGAL_BRAND
      ? `${escapeLegalHtml(LEGAL_BRAND)} · ${escapeLegalHtml(LEGAL_ENTITY)}`
      : escapeLegalHtml(LEGAL_BRAND);
  const unsub = opts?.unsubscribeUrl
    ? `<a href="${escapeLegalAttr(opts.unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>`
    : escapeLegalHtml(unsubscribeLine());

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #e5e7eb">
  <tr>
    <td style="padding-top:20px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#6b7280">
      <div style="font-weight:600;color:#374151;letter-spacing:0.02em">${brandLine}</div>
      ${addressLines
        .map(
          (line) =>
            `<div style="margin-top:2px">${escapeLegalHtml(line)}</div>`,
        )
        .join("")}
      <div style="margin-top:12px">${unsub}</div>
    </td>
  </tr>
</table>`;
}

function escapeLegalHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeLegalAttr(s: string): string {
  return escapeLegalHtml(s).replace(/'/g, "&#39;");
}
