import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/app/auth-forms";

export const metadata: Metadata = {
  title: "Choose a new password",
  // The URL carries a single-use credential; keep it out of any index.
  robots: { index: false, follow: false },
};

/**
 * Landing page for the emailed reset link.
 *
 * Better Auth validates the token at /api/auth/reset-password/:token and then
 * redirects here with either `?token=` or `?error=INVALID_TOKEN`. The token is
 * checked again when the new password is submitted, so an expired or reused
 * link fails there even if someone crafts this URL by hand.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return <ResetPasswordForm token={!error && token ? token : null} />;
}
