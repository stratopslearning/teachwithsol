"use client";

import { SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

import { AuthFormSkeleton } from "@/components/auth/AuthFormSkeleton";
import { clerkAppearance } from "@/components/auth/clerk-appearance";
import { withBasePath } from "@/lib/basePath";

function withRedirectQuery(path: string, redirectUrl: string | null): string {
  const base = withBasePath(path);
  if (!redirectUrl) return base;
  const params = new URLSearchParams({ redirect_url: redirectUrl });
  return `${base}?${params.toString()}`;
}

export function AuthSignIn() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url");

  return (
    <SignIn
      path={withBasePath("/login")}
      routing="path"
      signUpUrl={withRedirectQuery("/signup", redirectUrl)}
      // Prefer Clerk's redirect_url (invite claim links, OAuth connectors).
      // forceRedirectUrl would override that and strand mid-flow.
      fallbackRedirectUrl={withBasePath("/dashboard")}
      appearance={clerkAppearance}
      fallback={<AuthFormSkeleton variant="signin" />}
    />
  );
}
