import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate server environment configuration at Node boot. Do not run this
    // in the edge runtime: middleware is invoked for public routes too, and
    // failing server-only invariants there turns every request into
    // MIDDLEWARE_INVOCATION_FAILED.
    const { env } = await import("./lib/env");
    try {
      env();
    } catch (error) {
      console.error("[instrumentation] Environment validation failed:", error);
      if (process.env.NODE_ENV === "production") {
        throw error;
      }
    }

    // Refuse Node boot when DATABASE_URL can bypass RLS or own tables.
    //
    // Only a *confirmed* unsafe role fails boot. A network error reaching the
    // database (Neon cold start, ECONNRESET, TLS drop) is retried, then logged:
    // since Next 15.5 a throwing register() turns every request on that
    // instance into a 500 until it is recycled, which took down /login on
    // 2026-11-20. Workers still re-check with requireSafeRuntimeRole().
    const { assertRuntimeRole, RuntimeRoleError } = await import(
      "./lib/db/assertRuntimeRole"
    );
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const role = await assertRuntimeRole();
        if (!role.ok) throw new RuntimeRoleError(role.reason);
        lastError = null;
        break;
      } catch (error) {
        if (error instanceof Error && error.name === "RuntimeRoleError") {
          console.error("[instrumentation] Unsafe runtime DB role:", error);
          throw error;
        }
        lastError = error;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
    if (lastError) {
      console.error(
        "[instrumentation] Runtime DB role check could not reach the database; continuing:",
        lastError,
      );
    }

    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
