"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function UserMenu({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  // The initial is derived from the name, falling back to the email, so a user
  // who signed up without filling in a name still gets a sensible avatar.
  const initial = (user.name?.trim() || user.email).charAt(0).toUpperCase();

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <div
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-600)]/12 text-xs font-semibold text-[var(--color-primary)]"
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{user.name || "Your account"}</p>
        <p className="truncate text-xs text-[var(--color-ink-subtle)]">{user.email}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSignOut}
        disabled={pending}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut />
      </Button>
    </div>
  );
}
