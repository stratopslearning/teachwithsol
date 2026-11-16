import { withBasePath } from '@/lib/basePath';
import { solHostsConfigured, solHref, solOrigin } from '@/lib/solHosts';

/**
 * Public site origin (no path). On Sol multi-host deploys this is the
 * marketing host (www.teachwithsol.com) so sitemaps/canonicals stay branded.
 */
export function siteOrigin(): string {
  if (solHostsConfigured()) {
    const marketing = solOrigin('marketing');
    if (marketing) return marketing;
  }
  const raw = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return raw.replace(/\/$/, '');
}

/**
 * Absolute public URL. On Sol, docs/trust/app paths resolve to the correct
 * subdomain via solHref; StratOps keeps basePath (/learning).
 */
export function absoluteUrl(path: string = '/'): string {
  if (solHostsConfigured()) {
    const href = solHref(path);
    if (href.startsWith('http://') || href.startsWith('https://')) return href;
    return `${siteOrigin()}${href.startsWith('/') ? href : `/${href}`}`;
  }
  return `${siteOrigin()}${withBasePath(path)}`;
}

/**
 * Origin for links into the app (invite/claim links), or undefined when
 * NEXT_PUBLIC_BASE_URL isn't configured; callers then build relative links.
 */
export function appBaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || undefined;
}
