import type { Metadata } from "next";

import { SignInForm } from "@/components/app/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; deleted?: string }>;
}) {
  const { reset, deleted } = await searchParams;
  return (
    <SignInForm
      notice={
        reset === "1"
          ? "Your password was changed. Sign in with the new one."
          : deleted === "1"
            ? "Your account and all of its records have been deleted."
            : undefined
      }
    />
  );
}
