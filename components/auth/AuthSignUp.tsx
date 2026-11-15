"use client";

import { SignUp } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

import { AgeGate } from "@/components/auth/AgeGate";
import { AuthFormSkeleton } from "@/components/auth/AuthFormSkeleton";
import { clerkAppearance } from "@/components/auth/clerk-appearance";
import { withBasePath } from "@/lib/basePath";

function withRedirectQuery(path: string, redirectUrl: string | null): string {
  const base = withBasePath(path);
  if (!redirectUrl) return base;
  const params = new URLSearchParams({ redirect_url: redirectUrl });
  return `${base}?${params.toString()}`;
}

export function AuthSignUp() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url");

  return (
    <AgeGate>
      <SignUp
        path={withBasePath("/signup")}
        routing="path"
        signInUrl={withRedirectQuery("/login", redirectUrl)}
        // Prefer Clerk's redirect_url so invite claim links survive signup.
        fallbackRedirectUrl={withBasePath("/dashboard")}
        appearance={clerkAppearance}
        fallback={<AuthFormSkeleton variant="signup" />}
      />
    </AgeGate>
  );
}
