import type { Metadata } from "next";

import { Navbar } from "@/components/frontend/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { Hero } from "@/components/marketing/Hero";
import { HumanSafety } from "@/components/marketing/HumanSafety";
import { LoopSteps } from "@/components/marketing/LoopSteps";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { JsonLd } from "@/components/seo/JsonLd";
import { FOUNDERS_EMAIL, publicPrivacyContactEmail } from "@/lib/marketing/legal";
import { MARKETING_FAQS } from "@/lib/marketing/faq";
import { socialMetadata } from "@/lib/marketing/pageMeta";
import { brandAliases, organizationSameAs, SEO } from "@/lib/marketing/seo";
import { foundersContactEnabled } from "@/lib/solHosts";
import { absoluteUrl } from "@/lib/siteUrl";

const homeTitle = `${SEO.brand} · ${SEO.tagline}`;
const homeUrl = absoluteUrl("/");

export const metadata: Metadata = {
  title: {
    absolute: homeTitle,
  },
  description: SEO.description,
  alternates: {
    canonical: homeUrl,
  },
  ...socialMetadata({
    title: homeTitle,
    description: SEO.description,
    url: homeUrl,
  }),
};

export default async function Home() {
  const aliases = brandAliases();
  const sameAs = organizationSameAs();

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: SEO.brand,
            alternateName: aliases.filter((n) => n !== SEO.brand),
            url: homeUrl,
            description: SEO.description,
            logo: absoluteUrl("/icon"),
            email: publicPrivacyContactEmail(),
            ...(foundersContactEnabled()
              ? {
                  contactPoint: {
                    "@type": "ContactPoint",
                    email: FOUNDERS_EMAIL,
                    contactType: "founders",
                    availableLanguage: "English",
                  },
                }
              : {}),
            ...(sameAs.length ? { sameAs } : {}),
            knowsAbout: [
              "AI teaching",
              "Canvas LMS",
              "course authoring",
              "AI tutoring",
              "assessment integrity",
              "higher education",
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SEO.brand,
            alternateName: aliases,
            url: homeUrl,
            description: SEO.description,
            publisher: {
              "@type": "Organization",
              name: SEO.brand,
              url: homeUrl,
            },
            inLanguage: "en-US",
          },
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: homeTitle,
            url: homeUrl,
            description: SEO.description,
            isPartOf: { "@type": "WebSite", name: SEO.brand, url: homeUrl },
            speakable: {
              "@type": "SpeakableSpecification",
              cssSelector: [
                "[data-speakable='hero']",
                "#faq [data-speakable='faq-answer']",
              ],
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: SEO.productName,
            alternateName: aliases,
            applicationCategory: "EducationalApplication",
            applicationSubCategory: "Learning Management Teaching Layer",
            operatingSystem: "Web",
            url: homeUrl,
            description:
              "Turns instructor materials into courses, practice, and quizzes; tutors from the course only; assesses in ways that are hard to game; grades with auditable rubrics; shows concept-level gaps. Built for Canvas.",
            featureList: [
              "Course authoring from materials",
              "Course-scoped AI tutor",
              "Quizzes and assessments",
              "Rubric grading with Attention review",
              "Concept-level analytics",
              "Canvas LTI when enabled",
            ],
            offers: {
              "@type": "Offer",
              availability: "https://schema.org/InStock",
              price: "0",
              priceCurrency: "USD",
              description:
                "Book a demo for a free pilot. Department plans on request.",
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: MARKETING_FAQS.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: {
                "@type": "Answer",
                text: item.a,
              },
            })),
          },
        ]}
      />
      <div className="mkt min-h-dvh">
        <Navbar />
        <main id="main" className="min-h-dvh">
          <Hero />
          <LoopSteps />
          <MarketingFaq />
          <HumanSafety />
          <Footer />
        </main>
      </div>
    </>
  );
}
