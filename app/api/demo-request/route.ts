import { NextResponse } from "next/server";
import { z } from "zod";

import { emailComplianceFooter } from "@/lib/marketing/legal";
import { rateLimit } from "@/lib/rateLimit";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  institution: z.string().trim().min(1).max(200),
  lms: z.string().trim().min(1).max(80),
});

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const limited = await rateLimit({
    key: `demo-request:${ip}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.success) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check name, email, institution, and LMS." },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  // Ops inbox: wire to email later. When you do, append emailComplianceFooter()
  // (physical address + unsubscribe) for CAN-SPAM. Log structured for now.
  console.info("[demo-request]", {
    name: payload.name,
    email: payload.email,
    institution: payload.institution,
    lms: payload.lms,
    at: new Date().toISOString(),
    emailFooterPreview: emailComplianceFooter(),
  });

  return NextResponse.json({ ok: true });
}
