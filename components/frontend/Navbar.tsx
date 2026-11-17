"use client";

import { apiFetch } from "@/lib/api/client";
import { useEffect, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useSpring,
} from "framer-motion";
import { useUser } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { Menu, X } from "@/components/icons";

import { ThemedUserButton } from "@/components/auth/ThemedUserButton";
import { SolMark } from "@/components/brand/SolMark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { CAL_BOOKING_URL } from "@/lib/marketing/calBooking";
import type { DashboardAreas } from "@/lib/authz/gates";
import {
  marketingDashboardCtaLabel,
  resolveMarketingDashboardHref,
} from "@/lib/marketing/dashboardLinks";
import { solDemoOnly, solHref } from "@/lib/solHosts";

interface DbUser {
  paid?: boolean;
  areas?: DashboardAreas;
}

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#faq", label: "FAQ" },
  { href: "/blog", label: "Blogs" },
] as const;

/** Scroll distance (px) over which the nav morphs from bare → glass pill. */
const MORPH_RANGE = 120;

type NavbarProps = {
  /** `solid` starts as the frosted pill (docs / legal). Default morphs over hero. */
  variant?: "landing" | "solid";
};

export function Navbar({ variant = "landing" }: NavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const { isSignedIn } = useUser();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const solid = variant === "solid";
  const isDark = mounted && resolvedTheme === "dark";

  const raw = useMotionValue(solid ? 1 : 0);
  const progress = useSpring(raw, { stiffness: 160, damping: 28, mass: 0.4 });

  const shellBg = useTransform(progress, (p) => {
    const a = Math.min(1, Math.max(0, p)) * 0.78;
    return isDark
      ? `rgba(23, 22, 18, ${a})`
      : `rgba(244, 241, 232, ${a})`;
  });
  const shellBorder = useTransform(progress, (p) => {
    const a = Math.min(1, Math.max(0, p)) * 0.75;
    return isDark
      ? `rgba(53, 49, 40, ${a})`
      : `rgba(221, 214, 198, ${a})`;
  });
  const shellBlur = useTransform(progress, [0, 1], ["blur(0px)", "blur(16px)"]);
  const shellRadius = useTransform(progress, [0, 1], [0, 999]);
  const shellMaxWidth = useTransform(progress, [0, 1], ["100%", "64rem"]);
  const shellPadX = useTransform(progress, [0, 1], [4, 16]);
  const shellShadow = useTransform(progress, (p) => {
    const a = Math.min(1, Math.max(0, p));
    return isDark
      ? `0 8px 28px -12px rgba(0, 0, 0, ${a * 0.45})`
      : `0 8px 28px -12px rgba(60, 50, 30, ${a * 0.14})`;
  });
  const railPad = useTransform(progress, [0, 1], [12, 16]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      apiFetch("/api/user")
        .then((res) => res.json())
        .then((data) => setDbUser(data.user))
        .catch((err) => console.error("Error fetching user:", err));
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (solid) {
      raw.set(1);
      return;
    }
    const onScroll = () => {
      const p = Math.min(1, Math.max(0, window.scrollY / MORPH_RANGE));
      raw.set(p);
      if (p < 0.15) setIsMobileMenuOpen(false);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [raw, solid]);

  const dashboardHref = dbUser?.areas
    ? resolveMarketingDashboardHref(dbUser.areas, Boolean(dbUser.paid))
    : null;
  const deskCtaLabel = dbUser?.areas
    ? marketingDashboardCtaLabel(dbUser.areas, Boolean(dbUser.paid))
    : "Open desk";

  return (
    <>
      <header className="pointer-events-none fixed top-0 left-0 right-0 z-40">
        <motion.div
          className="page-rail px-3 md:px-6"
          style={{ paddingTop: railPad }}
        >
          <motion.div
            className="pointer-events-auto relative mx-auto flex h-14 items-center gap-3 border"
            style={{
              backgroundColor: shellBg,
              borderColor: shellBorder,
              borderRadius: shellRadius,
              maxWidth: shellMaxWidth,
              paddingLeft: shellPadX,
              paddingRight: shellPadX,
              boxShadow: shellShadow,
              backdropFilter: shellBlur,
              WebkitBackdropFilter: shellBlur,
            }}
          >
            <a
              href={solHref("/")}
              className="relative z-10 flex shrink-0 items-center gap-2 text-ink"
              aria-label="SOL home"
            >
              <SolMark className="h-7 w-7" />
              <span className="font-display text-[1.2rem] leading-none tracking-tight">
                SOL
              </span>
            </a>

            <nav className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-7 text-sm text-ink-muted md:flex">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={solHref(link.href)}
                  className="transition-colors hover:text-ink"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="relative z-10 ml-auto hidden items-center gap-2 md:flex">
              <ThemeToggle variant="ghost" />
              {solDemoOnly() ? (
                <Button
                  asChild
                  size="sm"
                  className="rounded-full px-4 shadow-none"
                >
                  <a
                    href={CAL_BOOKING_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Book a demo
                  </a>
                </Button>
              ) : isSignedIn && dbUser ? (
                <>
                  {dashboardHref ? (
                    <Button asChild size="sm" className="rounded-full px-4">
                      <a href={dashboardHref}>
                        {deskCtaLabel}
                      </a>
                    </Button>
                  ) : null}
                  <ThemedUserButton />
                </>
              ) : (
                <>
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="rounded-full text-ink-muted hover:text-ink"
                  >
                    <a href={solHref("/login")}>Sign in</a>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    className="rounded-full px-4 shadow-none"
                  >
                    <a
                      href={CAL_BOOKING_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Book a demo
                    </a>
                  </Button>
                </>
              )}
            </div>

            <div className="relative z-10 ml-auto flex items-center gap-2 md:hidden">
              <ThemeToggle variant="ghost" />
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen((v) => !v)}
                aria-label="Toggle menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rule/40 text-ink"
              >
                {isMobileMenuOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Menu className="h-4 w-4" />
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      </header>

      <AnimatePresence>
        {isMobileMenuOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-auto fixed top-[4.5rem] left-3 right-3 z-30 rounded-2xl border border-rule bg-paper/95 p-4 shadow-paper-lg backdrop-blur-md md:hidden"
          >
            <div className="flex flex-col gap-2">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={solHref(link.href)}
                  className="rounded-lg px-2 py-2.5 text-sm text-ink"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="hairline my-1" />
              {solDemoOnly() ? (
                <Button asChild className="w-full rounded-full">
                  <a
                    href={CAL_BOOKING_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Book a demo
                  </a>
                </Button>
              ) : isSignedIn ? (
                dashboardHref ? (
                  <Button asChild className="w-full rounded-full">
                    <a href={dashboardHref}>Open desk</a>
                  </Button>
                ) : null
              ) : (
                <>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full rounded-full"
                  >
                    <a href={solHref("/login")}>Sign in</a>
                  </Button>
                  <Button asChild className="w-full rounded-full">
                    <a
                      href={CAL_BOOKING_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Book a demo
                    </a>
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
