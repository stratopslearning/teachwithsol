import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { AuthSignInLazy } from "@/components/auth/AuthWidgetsLazy";
import { CAL_BOOKING_URL } from "@/lib/marketing/calBooking";
import { solDemoOnly } from "@/lib/solHosts";

export const metadata: Metadata = {
  title: { absolute: "SOL" },
};

export default function LoginPage() {
  if (solDemoOnly()) {
    redirect(CAL_BOOKING_URL);
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to open your desk and keep teaching moving."
      paintingSrc="/marketing/auth-sealed-journal.jpg"
      paintingAlt="Oil painting of a leather-bound journal with a red wax seal on a sunlit desk"
    >
      <AuthSignInLazy />
    </AuthShell>
  );
}
