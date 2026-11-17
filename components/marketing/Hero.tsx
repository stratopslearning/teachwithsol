"use client";

import { apiFetch } from "@/lib/api/client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/SplitText";

import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/basePath";
import { CAL_BOOKING_URL } from "@/lib/marketing/calBooking";
import type { DashboardAreas } from "@/lib/authz/gates";
import {
  marketingDashboardCtaLabel,
  resolveMarketingDashboardHref,
} from "@/lib/marketing/dashboardLinks";

const CLASSROOM_BG = withBasePath("/marketing/classroom-morning.jpg");

gsap.registerPlugin(useGSAP, SplitText);

interface DbUser {
  paid?: boolean;
  areas?: DashboardAreas;
}

export function Hero() {
  const { isSignedIn } = useUser();
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    apiFetch("/api/user")
      .then((res) => res.json())
      .then((data) => setDbUser(data.user))
      .catch((err) => console.error("Error fetching user:", err));
  }, [isSignedIn]);

  const primaryHref = dbUser?.areas
    ? resolveMarketingDashboardHref(dbUser.areas, Boolean(dbUser.paid))
    : null;

  const primaryLabel = dbUser?.areas
    ? marketingDashboardCtaLabel(dbUser.areas, Boolean(dbUser.paid))
    : "Open your dashboard";

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
          motionOk: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { reduceMotion } = context.conditions!;
          if (reduceMotion) return;

          const bg = rootRef.current?.querySelector<HTMLElement>(
            '[data-hero="bg"]',
          );
          const headline = rootRef.current?.querySelector<HTMLElement>(
            '[data-hero="headline"]',
          );
          const fade = rootRef.current?.querySelectorAll("[data-hero-fade]");
          if (!headline) return;

          const tl = gsap.timeline({
            defaults: { ease: "power3.out" },
          });

          if (bg) {
            tl.from(
              bg,
              { scale: 1.06, autoAlpha: 0.85, duration: 1.35 },
              0,
            );
          }

          const split = SplitText.create(headline, {
            type: "words",
            autoSplit: true,
            onSplit(self) {
              return tl.from(
                self.words,
                {
                  autoAlpha: 0,
                  yPercent: 24,
                  stagger: 0.055,
                  duration: 0.7,
                },
                0.08,
              );
            },
          });

          if (fade?.length) {
            tl.from(
              fade,
              { autoAlpha: 0, y: 16, stagger: 0.1, duration: 0.7 },
              "-=0.35",
            );
          }

          return () => {
            split.revert();
          };
        },
      );

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      aria-label="SOL — teach with SOL. The operating system for teaching."
      className="mkt-hero relative isolate overflow-hidden"
    >
      <div className="absolute inset-0 h-full w-full" aria-hidden data-hero="bg">
        <Image
          src={CLASSROOM_BG}
          alt="Sunlit empty classroom with wooden desks at morning, suggesting calm teaching space"
          fill
          priority
          className="object-cover object-[center_40%] sm:object-[center_42%]"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--paper)_55%,transparent)_0%,color-mix(in_oklch,var(--paper)_18%,transparent)_36%,transparent_58%,color-mix(in_oklch,var(--paper)_25%,transparent)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[920px] flex-col items-center px-4 pb-10 pt-[max(5.5rem,calc(env(safe-area-inset-top)+4.25rem))] text-center md:px-8 md:pb-16 md:pt-36">
        <div className="relative mt-[min(8vh,3.5rem)] flex w-full items-center justify-center px-2">
          <h1
            data-hero="headline"
            className="max-w-[14ch] font-display text-ink text-balance dark:text-[#1c1b17]"
            style={{
              fontSize: "clamp(2.6rem, 7vw, 4.75rem)",
              lineHeight: 1.05,
              fontWeight: 400,
            }}
          >
            The operating system{" "}
            <em className="mkt-italic">for teaching.</em>
          </h1>
        </div>

        <p
          data-hero-fade
          data-speakable="hero"
          className="mt-6 max-w-[48ch] text-[0.95rem] leading-relaxed text-[#1c1b17] md:text-base"
        >
          The AI teaching layer for the LMS you already use. Turn your materials
          into courses, practice, and tutoring.
        </p>

        <div data-hero-fade className="mt-8">
          {isSignedIn && primaryHref ? (
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl px-8 text-[0.95rem] shadow-none"
            >
              <a href={primaryHref}>{primaryLabel}</a>
            </Button>
          ) : (
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl px-8 text-[0.95rem] shadow-none"
            >
              <a
                href={CAL_BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a demo
              </a>
            </Button>
          )}
        </div>

        {/* flex-1 keeps copy in the upper band without growing past the viewport */}
        <div className="mt-auto min-h-0 w-full flex-1" aria-hidden />
      </div>
    </section>
  );
}
