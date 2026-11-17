"use client";

import { apiFetch } from "@/lib/api/client";
import { useState } from "react";
import { ChevronDown } from "@/components/icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirmAction } from "@/components/feedback/ConfirmDialog";
import { useRouter } from "next/navigation";

export function UserActions({
  user,
  canGrantPlatformStaff = false,
}: {
  user: {
    id: string;
    email: string | null;
    platformStaff?: boolean | null;
    firstName?: string | null;
    lastName?: string | null;
  };
  canGrantPlatformStaff?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isStaff = Boolean(user.platformStaff);

  const handlePlatformStaffToggle = async () => {
    const next = !isStaff;
    const label = next ? "grant" : "revoke";
    if (!await confirmAction(`${label} platform staff for ${user.email ?? user.id}?`)) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/user/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformStaff: next }),
      });
      if (res.ok) {
        toast.success(
          next ? "Platform staff granted" : "Platform staff revoked",
        );
        router.refresh();
      } else {
        toast.error("Failed to update platform staff");
      }
    } catch {
      toast.error("Failed to update platform staff");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const label = user.email || user.id;
    const ok = await confirmAction(
      `Permanently delete ${label}?\n\nThis removes their Clerk account first, then the SOL profile. Quizzes they authored are reassigned to you. This cannot be undone.`,
    );
    if (!ok) return;
    const typed = window.prompt(
      `Type DELETE to confirm removal of ${label}`,
    );
    if (typed !== "DELETE") {
      toast.message("Delete cancelled");
      return;
    }

    setLoading(true);
    try {
      const runDelete = (allowMissingClerk: boolean) =>
        apiFetch(
            `/api/admin/user/${user.id}${allowMissingClerk ? "?allowMissingClerk=1" : ""}`,
          { method: "DELETE" },
        );

      let res = await runDelete(false);
      let data = (await res.json().catch(() => ({}))) as {
        error?: string;
        allowMissingClerk?: boolean;
        clerkDeleted?: boolean;
      };

      if (res.status === 409 && data.allowMissingClerk) {
        const orphanOk = await confirmAction(
          `${data.error}\n\nDelete the SOL row only (Clerk user not found with this API key)?`,
        );
        if (!orphanOk) {
          toast.message("Delete cancelled");
          return;
        }
        res = await runDelete(true);
        data = (await res.json().catch(() => ({}))) as typeof data;
      }

      if (res.ok) {
        toast.success(
          data.clerkDeleted === false
            ? "SOL profile deleted (Clerk was already missing)"
            : "User deleted from Clerk and SOL",
        );
        router.refresh();
      } else {
        toast.error(data.error || "Failed to delete user");
      }
    } catch {
      toast.error("Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={loading}>
          Actions
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canGrantPlatformStaff ? (
          <>
            <DropdownMenuLabel>Access</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void handlePlatformStaffToggle()}
              disabled={loading}
            >
              {isStaff ? "Revoke platform staff" : "Grant platform staff"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void handleDelete();
          }}
          disabled={loading}
          className="text-danger focus:text-danger"
        >
          Delete user…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
