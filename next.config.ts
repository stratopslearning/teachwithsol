import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/basePath";

const nextConfig: NextConfig = {
  // CI (Typecheck + Lint jobs) gates every merge, so `next build` skips its
  // own lint and type-check pass. Running them again inside the Vercel build
  // pushed it over the build container's memory and got it OOM-killed.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Empty string = Sol (no prefix). Unset env defaults to `/learning` in lib/basePath.
  ...(BASE_PATH ? { basePath: BASE_PATH } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
    // Same value on server and client. Production teachwithsol is the only
    // deploy that publishes founders@teachwithsol.com.
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || "development",
  },
  // Zip packs / book EPUBs can be up to 50 MB. Default Server Action limit is 1 MB;
  // keep this aligned with MIDDLEWARE_UPLOAD_MAX_BODY_BYTES in lib/api/sameOrigin.ts.
  experimental: {
    serverActions: {
      bodySizeLimit: "51mb",
    },
  },
  // Keep pdf-parse (and its pdf.js worker) out of the app bundle — the package
  // "browser" export breaks PDF text extraction in the server runtime.
  // ws + optional natives must stay external — bundling breaks bufferUtil.mask
  // and Neon WebSocket transactions die with "Connection terminated unexpectedly".
  serverExternalPackages: ["pdf-parse", "ws", "bufferutil", "utf-8-validate"],
  async headers() {
    // Production uses a Clerk custom Frontend API host (clerk.strat-ops.net).
    // Without it in script/connect/frame-src, clerk-js is blocked by CSP.
    const clerkFrontendApi =
      process.env.NEXT_PUBLIC_CLERK_FRONTEND_API?.replace(/\/$/, '') ||
      'https://clerk.strat-ops.net';
    // Optional satellite FAPI host (e.g. https://clerk.teachwithsol.com)
    const clerkSatelliteFrontendApi =
      process.env.NEXT_PUBLIC_CLERK_SATELLITE_FRONTEND_API?.replace(/\/$/, '') ||
      '';

    const clerkScriptHosts = [
      'https://*.clerk.accounts.dev',
      'https://*.clerk.com',
      clerkFrontendApi,
      clerkSatelliteFrontendApi,
      'https://*.protect.clerk.com',
    ].filter(Boolean);

    // Clerk bot-protection probes use non-default HTTPS ports. CSP host
    // sources without a port only allow :443, so those probes get blocked
    // and sign-up can bounce after OTP.
    const clerkProtectPorts = [8443, 18443, 2082, 2083, 2086, 2087, 2096, 8443, 8880, 2053, 992];
    const clerkProtectConnect = [
      'https://*.protect.clerk.com',
      ...[...new Set(clerkProtectPorts)].map(
        (port) => `https://*.protect.clerk.com:${port}`,
      ),
    ];

    const clerkConnectHosts = [
      ...clerkScriptHosts,
      ...clerkProtectConnect,
      'wss://*.clerk.accounts.dev',
      `wss://${clerkFrontendApi.replace(/^https?:\/\//, '')}`,
      ...(clerkSatelliteFrontendApi
        ? [`wss://${clerkSatelliteFrontendApi.replace(/^https?:\/\//, '')}`]
        : []),
      // Dev telemetry (optional; blocked otherwise under CSP).
      'https://clerk-telemetry.com',
    ];

    // Browser → S3 presigned PUTs (book uploads). CSP host wildcards only cover
    // one DNS label, so include virtual-hosted + path-style for the deploy region.
    const awsRegion = process.env.AWS_REGION || 'us-west-1';
    const awsBucket = process.env.AWS_S3_BUCKET?.trim();
    const s3ConnectHosts = [
      `https://*.s3.${awsRegion}.amazonaws.com`,
      `https://s3.${awsRegion}.amazonaws.com`,
      'https://*.s3.amazonaws.com',
      'https://s3.amazonaws.com',
      ...(awsBucket
        ? [
            `https://${awsBucket}.s3.${awsRegion}.amazonaws.com`,
            `https://${awsBucket}.s3.amazonaws.com`,
          ]
        : []),
    ];

    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https:",
      // Clerk still needs 'unsafe-inline' (no nonce CSP in this pass).
      // Production drops 'unsafe-eval'; Next.js production bundles do not
      // require it. Dev keeps eval for webpack/HMR.
      [
        `script-src 'self' 'unsafe-inline' blob:${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
        ...clerkScriptHosts,
        'https://challenges.cloudflare.com',
        'https://js.stripe.com',
        'https://browser.sentry-cdn.com',
        'https://*.sentry.io',
      ].join(' '),
      [
        "connect-src 'self'",
        ...clerkConnectHosts,
        ...s3ConnectHosts,
        'https://challenges.cloudflare.com',
        'https://api.stripe.com',
        'https://*.sentry.io',
        'https://*.upstash.io',
        'https://*.neon.tech',
      ].join(' '),
      [
        // blob: for same-origin PDF preview iframes (MaterialPreviewDialog)
        "frame-src 'self' blob:",
        'https://js.stripe.com',
        ...clerkScriptHosts,
        'https://challenges.cloudflare.com',
        // Book chapter embeds (Pressbooks / EPUB revive)
        'https://www.youtube.com',
        'https://youtube.com',
        'https://www.youtube-nocookie.com',
        'https://player.vimeo.com',
      ].join(' '),
      "worker-src 'self' blob:",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(self)',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "strat-ops",

  project: "sentry-fuchsia-mountain",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
