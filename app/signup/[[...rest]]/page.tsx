import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { AuthSignUpLazy } from "@/components/auth/AuthWidgetsLazy";
import { CAL_BOOKING_URL } from "@/lib/marketing/calBooking";
import { solDemoOnly } from "@/lib/solHosts";

export const metadata: Metadata = {
  title: { absolute: "SOL" },
};

export default function SignUpPage() {
  if (solDemoOnly()) {
    redirect(CAL_BOOKING_URL);
  }

  return (
    <AuthShell
      title="Create your account"
      description="Join a section, build coursework, and review graded work."
      paintingSrc="/marketing/auth-inkpot.jpg"
      paintingAlt="Oil painting of an ink pot and fountain pen on parchment"
    >
      <AuthSignUpLazy />
    </AuthShell>
  );
}
