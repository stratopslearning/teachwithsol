"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@/components/icons";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { SolMark } from "@/components/brand/SolMark";
import { Button } from "@/components/ui/button";
import { appPath, withBasePath } from "@/lib/basePath";
import { CAL_BOOKING_URL } from "@/lib/marketing/calBooking";
import { solDemoOnly } from "@/lib/solHosts";

const GROVE = withBasePath("/marketing/hero-grove.jpg");

gsap.registerPlugin(useGSAP);

export default function NotFound() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        tl.from('[data-nf="brand"]', { opacity: 0, y: 10, duration: 0.45 })
          .from(
            '[data-nf="title"]',
            { opacity: 0, y: 18, duration: 0.55 },
            "-=0.2",
          )
          .from(
            '[data-nf="copy"]',
            { opacity: 0, y: 14, duration: 0.45 },
            "-=0.25",
          )
          .from(
            '[data-nf="actions"]',
            { opacity: 0, y: 12, duration: 0.4 },
            "-=0.2",
          );
        return () => tl.kill();
      });
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <main
      ref={rootRef}
      className="mkt relative isolate flex min-h-[100svh] overflow-hidden bg-paper text-ink"
    >
      <div className="absolute inset-0" aria-hidden>
        <Image
          src={GROVE}
          alt=""
          fill
          priority
          className="object-cover object-[center_40%]"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--paper)_72%,transparent)_0%,color-mix(in_oklch,var(--paper)_35%,transparent)_42%,color-mix(in_oklch,var(--paper)_70%,transparent)_100%)]" />
      </div>

      <div className="relative z-10 page-rail flex flex-1 flex-col items-center justify-center px-4 py-24 md:px-8">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <a
            data-nf="brand"
            href={appPath("/")}
            className="inline-flex items-center gap-2 text-ink"
            aria-label="SOL home"
          >
            <SolMark className="h-8 w-8" />
            <span className="font-display text-[1.35rem] leading-none tracking-tight">
              SOL
            </span>
          </a>

          <h1
            data-nf="title"
            className="mt-8 font-display text-ink text-balance"
            style={{
              fontSize: "clamp(2.4rem, 5.5vw, 3.75rem)",
              lineHeight: 1.08,
            }}
          >
            This page{" "}
            <em className="mkt-italic text-ink-muted">isn’t here.</em>
          </h1>

          <p
            data-nf="copy"
            className="mt-5 max-w-[36ch] text-base leading-relaxed text-ink-muted text-balance md:text-lg"
          >
            The link may be outdated or mistyped. Head home and pick up where
            you left off.
          </p>

          <div
            data-nf="actions"
            className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Button asChild size="lg" className="mkt-pill px-7 shadow-none">
              <Link href={appPath("/")}>
                <ArrowLeft className="h-4 w-4" />
                Back to homepage
              </Link>
            </Button>
            {solDemoOnly() ? (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="mkt-pill border-rule bg-surface/80 px-7 backdrop-blur-sm"
              >
                <a
                  href={CAL_BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a demo
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            ) : (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="mkt-pill border-rule bg-surface/80 px-7 backdrop-blur-sm"
              >
                <Link href={appPath("/login")}>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
