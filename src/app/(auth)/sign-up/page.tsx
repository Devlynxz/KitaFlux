import type { Metadata } from "next";

import { SignUpForm } from "@/components/app/auth-forms";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return <SignUpForm />;
}
