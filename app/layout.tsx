import type { Metadata } from "next";
// Fonts via next/font: files are downloaded at build and self-hosted from our
// origin at runtime (no fonts.googleapis.com requests from browsers).
import {
  Fraunces,
  Instrument_Sans,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
  Manrope,
} from "next/font/google";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmDialogHost } from "@/components/feedback/ConfirmDialog";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { authLocalization } from "@/components/auth/auth-localization";
import { TimeZoneProvider } from "@/components/timezone/TimeZoneProvider";
import { withBasePath } from "@/lib/basePath";
import {
  clerkAllowedRedirectOrigins,
  clerkSatelliteProviderProps,
} from "@/lib/clerkMultiDomain";
import { SEO, seoMetadataBase } from "@/lib/marketing/seo";
import { absoluteUrl } from "@/lib/siteUrl";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: seoMetadataBase(),
  title: {
    default: `${SEO.brand} · ${SEO.tagline}`,
    template: `%s · ${SEO.brand}`,
  },
  description: SEO.description,
  applicationName: SEO.brand,
  keywords: [...SEO.keywords],
  authors: [{ name: "SOL" }],
  creator: "SOL",
  publisher: "SOL",
  alternates: {
    canonical: absoluteUrl("/"),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Per-page routes set openGraph/twitter title, description, and url via
  // socialMetadata(). Keep only shared site fields here so docs/trust pages
  // do not inherit the homepage card.
  openGraph: {
    siteName: SEO.brand,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
  category: "education",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${instrumentSans.variable} ${instrumentSerif.variable} ${GeistSans.variable} ${inter.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased min-h-screen bg-paper text-ink">
        <ClerkProvider
          signInUrl={withBasePath("/login")}
          signUpUrl={withBasePath("/signup")}
          localization={authLocalization}
          // Satellite multi-domain props are env-gated; Clerk's satellite
          // overload requires proxyUrl/router* that we intentionally omit
          // when absolute sign-in URLs are set (see PRODUCTION_DEPLOY.md).
          {...(clerkSatelliteProviderProps() as Record<string, unknown>)}
          {...(clerkAllowedRedirectOrigins().length
            ? { allowedRedirectOrigins: clerkAllowedRedirectOrigins() }
            : {})}
        >
          <TimeZoneProvider>
            <ThemeProvider>
              <a href="#main" className="skip-to-main">
                Skip to main content
              </a>
              {children}
              <Toaster position="top-right" richColors closeButton />
              <ConfirmDialogHost />
            </ThemeProvider>
          </TimeZoneProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
