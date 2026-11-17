"use client";

import { useRef } from "react";
import Image from "next/image";
import { ArrowRight } from "@/components/icons";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { SolMark } from "@/components/brand/SolMark";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/basePath";
import { CAL_BOOKING_URL } from "@/lib/marketing/calBooking";
import { FOUNDERS_EMAIL, LEGAL_PRIVACY_EMAIL } from "@/lib/marketing/legal";
import {
  foundersContactEnabled,
  privacyEmailEnabled,
  solDemoOnly,
  solHref,
} from "@/lib/solHosts";

const PATH_LIGHT = withBasePath("/marketing/path-light.jpg");

gsap.registerPlugin(useGSAP, ScrollTrigger);

const productLinks = [
  { title: "How it works", href: solHref("/#product") },
  { title: "FAQ", href: solHref("/#faq") },
  { title: "Trust", href: solHref("/#trust") },
  { title: "Blogs", href: solHref("/blog") },
  { title: "Book a demo", href: CAL_BOOKING_URL, external: true },
] as const;

const companyLinksBase = [
  { title: "Docs", href: solHref("/docs") },
  { title: "About SOL", href: solHref("/docs/about-sol") },
  { title: "Blogs", href: solHref("/blog") },
  { title: "Security", href: solHref("/security") },
] as const;

const companyLinks = solDemoOnly()
  ? companyLinksBase
  : ([
      ...companyLinksBase,
      { title: "Sign in", href: solHref("/login") },
    ] as const);

const legalLinks = [
  { title: "Terms", href: solHref("/terms") },
  { title: "Privacy", href: solHref("/privacy") },
  { title: "Security", href: solHref("/security") },
  { title: "DMCA", href: solHref("/dmca") },
  { title: "Unsubscribe", href: solHref("/unsubscribe") },
] as const;

/** Closing CTA + footer as one painting band (Vestris-style). */
export function Footer() {
  const year = new Date().getFullYear();
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const bg = rootRef.current?.querySelector<HTMLElement>("[data-footer-bg]");
        const cta = rootRef.current?.querySelector("[data-footer-cta]");
        if (bg) {
          gsap.fromTo(
            bg,
            { scale: 1.06 },
            {
              scale: 1,
              ease: "none",
              scrollTrigger: {
                trigger: rootRef.current,
                start: "top bottom",
                end: "bottom top",
                scrub: true,
              },
            },
          );
        }
        if (cta) {
          gsap.from(cta, {
            autoAlpha: 0,
            y: 28,
            duration: 0.85,
            ease: "power3.out",
            scrollTrigger: {
              trigger: cta,
              start: "top 88%",
              toggleActions: "play none none none",
            },
          });
        }
      });
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="relative overflow-hidden">
      <div className="absolute inset-0" aria-hidden data-footer-bg>
        <Image
          src={PATH_LIGHT}
          alt="Sunlit path through trees toward an open clearing, for a calm close to the page"
          fill
          className="object-cover object-[center_35%]"
          sizes="100vw"
          priority={false}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--paper)_72%,transparent)_0%,color-mix(in_oklch,var(--paper)_28%,transparent)_28%,transparent_48%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_42%,color-mix(in_oklch,#2a3326_55%,transparent)_68%,#243022_88%,#1c261a_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.18] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
        <div
          className="absolute -top-8 -left-8 h-40 w-40 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in oklch, var(--paper) 70%, transparent) 1.1px, transparent 1.25px)",
            backgroundSize: "7px 7px",
            maskImage:
              "radial-gradient(circle at 30% 30%, black 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-[18%] -left-6 h-36 w-36 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(247,244,236,0.55) 1.1px, transparent 1.25px)",
            backgroundSize: "7px 7px",
            maskImage:
              "radial-gradient(circle at 40% 60%, black 0%, transparent 72%)",
          }}
        />
      </div>

      <section className="relative z-10">
        <div className="page-rail px-4 pt-24 pb-20 md:px-8 md:pt-32 md:pb-28">
          <div
            data-footer-cta
            className="mx-auto flex max-w-[36rem] flex-col items-center text-center"
          >
            <h2
              className="mt-6 font-display text-ink text-balance"
              style={{
                fontSize: "clamp(2rem, 2.2vw + 1.2rem, 3.4rem)",
                lineHeight: 1.1,
              }}
            >
              <em className="mkt-italic">Focus on the teaching.</em>
            </h2>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="mkt-pill min-w-[12rem] px-7">
                <a
                  href={CAL_BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a demo
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="mkt-pill min-w-[12rem] border-rule bg-surface/70 px-7 text-ink shadow-none backdrop-blur-md hover:bg-surface/90"
              >
                <a href={solHref("/docs/about-sol")}>About SOL</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 text-[#f4f1e8]">
        <div className="page-rail px-4 pb-10 pt-6 md:px-8 md:pb-12 md:pt-8">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
            <div className="max-w-[24rem] shrink-0 space-y-4">
              <a
                href={solHref("/")}
                className="inline-flex items-center gap-2.5 text-[#f4f1e8]"
                aria-label="SOL home"
              >
                <SolMark className="h-9 w-9 text-[#f4f1e8]" />
              </a>
              <p className="text-sm leading-relaxed text-[#f4f1e8]/70">
                The AI teaching layer for the LMS you already use. The operating
                system for teaching.
              </p>
              {foundersContactEnabled() ? (
                <p className="text-sm leading-relaxed text-[#f4f1e8]/70">
                  Founders:{" "}
                  <a
                    href={`mailto:${FOUNDERS_EMAIL}`}
                    className="underline decoration-[#f4f1e8]/35 underline-offset-2 transition-colors hover:text-[#f4f1e8] hover:decoration-[#f4f1e8]/70"
                  >
                    {FOUNDERS_EMAIL}
                  </a>
                </p>
              ) : null}
              {privacyEmailEnabled() ? (
                <p className="text-sm leading-relaxed text-[#f4f1e8]/70">
                  Privacy and campus IT:{" "}
                  <a
                    href={`mailto:${LEGAL_PRIVACY_EMAIL}`}
                    className="underline decoration-[#f4f1e8]/35 underline-offset-2 transition-colors hover:text-[#f4f1e8] hover:decoration-[#f4f1e8]/70"
                  >
                    {LEGAL_PRIVACY_EMAIL}
                  </a>
                </p>
              ) : null}
            </div>

            <nav
              aria-label="Footer"
              className="grid grid-cols-2 gap-x-12 gap-y-8 sm:gap-x-16"
            >
              <div>
                <h3 className="font-display text-[1.05rem] tracking-tight text-[#f4f1e8]">
                  Product
                </h3>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {productLinks.map((link) => (
                    <li key={link.title}>
                      <a
                        href={link.href}
                        {...("external" in link && link.external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="text-[#f4f1e8]/72 transition-colors hover:text-[#f4f1e8]"
                      >
                        {link.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-display text-[1.05rem] tracking-tight text-[#f4f1e8]">
                  Company
                </h3>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {companyLinks.map((link) => (
                    <li key={link.title}>
                      <a
                        href={link.href}
                        className="text-[#f4f1e8]/72 transition-colors hover:text-[#f4f1e8]"
                      >
                        {link.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          </div>

          <div className="mt-12 flex flex-col gap-4 border-t border-[#f4f1e8]/15 pt-6 sm:mt-14 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#f4f1e8]/55">
              © {year} SOL. All rights reserved.
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {legalLinks.map((link) => (
                <li key={link.title}>
                  <a
                    href={link.href}
                    className="text-[#f4f1e8]/55 transition-colors hover:text-[#f4f1e8]"
                  >
                    {link.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
