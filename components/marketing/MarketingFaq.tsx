"use client";

import { useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { withBasePath } from "@/lib/basePath";
import { FOUNDERS_EMAIL } from "@/lib/marketing/legal";
import { MARKETING_FAQS } from "@/lib/marketing/faq";

function FaqAnswer({ text }: { text: string }) {
  if (!text.includes(FOUNDERS_EMAIL)) return text;
  const [before, after] = text.split(FOUNDERS_EMAIL);
  return (
    <>
      {before}
      <a
        href={`mailto:${FOUNDERS_EMAIL}`}
        className="underline decoration-ink/30 underline-offset-2 transition-colors hover:text-ink hover:decoration-ink/60"
      >
        {FOUNDERS_EMAIL}
      </a>
      {after}
    </>
  );
}

const GROVE = withBasePath("/marketing/hero-grove.jpg");

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function MarketingFaq() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const bg = rootRef.current?.querySelector<HTMLElement>("[data-faq-bg]");
        if (bg) {
          gsap.fromTo(
            bg,
            { scale: 1.05 },
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
      });
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="faq"
      className="relative overflow-hidden border-t border-rule/60"
    >
      <div className="absolute inset-0" aria-hidden data-faq-bg>
        <Image
          src={GROVE}
          alt="Oil painting of a tree-lined academic path in soft morning light"
          fill
          className="object-cover object-[center_35%] opacity-90"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--mkt-sky)_55%,var(--paper))_0%,color-mix(in_oklch,var(--paper)_75%,transparent)_40%,var(--paper)_100%)]" />
      </div>

      <div className="page-rail relative z-10 px-4 py-20 md:px-8 md:py-28">
        <ScrollReveal>
          <div className="mx-auto max-w-[36rem] text-center">
            <p className="eyebrow text-ink-faint">FAQ</p>
            <h2
              className="mt-4 font-display text-ink text-balance"
              style={{
                fontSize: "clamp(1.9rem, 1.5vw + 1.3rem, 2.85rem)",
                lineHeight: 1.15,
              }}
            >
              Questions worth{" "}
              <em className="mkt-italic text-ink-muted">answering plainly</em>
            </h2>
            <p className="mx-auto mt-4 max-w-[40ch] text-base leading-relaxed text-ink-muted">
              What SOL is, what it isn’t, and how it fits the LMS you already
              use.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal className="mx-auto mt-12 max-w-[40rem]" delay={0.06}>
          <Accordion
            type="single"
            collapsible
            className="mkt-card overflow-hidden bg-surface/95 px-5 md:px-7"
          >
            {MARKETING_FAQS.map((item, index) => (
              <AccordionItem
                key={item.q}
                value={`faq-${index}`}
                className="border-rule/70"
              >
                <AccordionTrigger className="py-5 font-display text-[1.05rem] font-normal text-ink hover:no-underline md:text-[1.15rem] [&[data-state=open]]:text-ink">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent
                  data-speakable="faq-answer"
                  className="pb-5 text-[0.95rem] leading-relaxed text-ink-muted"
                >
                  <FaqAnswer text={item.a} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollReveal>
      </div>
    </section>
  );
}
