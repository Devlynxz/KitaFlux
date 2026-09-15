"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { requestPasswordReset, resetPassword, signIn, signUp } from "@/lib/auth-client";
import {
  fieldErrors,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation";

/**
 * Auth forms.
 *
 * These call Better Auth's client directly rather than going through a server
 * action, because the client is what sets the session cookie and handles the
 * redirect. Validation runs here for immediate feedback; the server validates
 * independently and is the real gate.
 *
 * Submitted from onSubmit rather than `<form action>`: React resets a form
 * after an action settles, which after a wrong password would also clear the
 * email the user has to try again with.
 */

function useAuthSubmit() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onDone() {
    // refresh() so the server components re-read the new session before the
    // dashboard renders; without it the shell can paint as signed-out.
    router.push("/dashboard");
    router.refresh();
  }

  return { router, pending, setPending, formError, setFormError, errors, setErrors, onDone };
}

function onSubmit(handle: (form: FormData) => Promise<void>) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handle(new FormData(event.currentTarget));
  };
}

/** Better Auth answers a tripped rate limit with 429 and a generic message. */
function tooManyAttempts(error: { status?: number }): boolean {
  return error.status === 429;
}

const TOO_MANY = "Too many attempts. Wait a few minutes, then try again.";

export function SignUpForm() {
  const { pending, setPending, formError, setFormError, errors, setErrors, onDone } =
    useAuthSubmit();

  async function handle(form: FormData) {
    setFormError(null);
    setErrors({});

    const parsed = signUpSchema.safeParse({
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setPending(true);
    const { error } = await signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setPending(false);

    if (error) {
      setFormError(
        tooManyAttempts(error)
          ? TOO_MANY
          : "Could not create that account. It may already exist — try signing in instead.",
      );
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit(handle)} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Free while KitaFlux is in early access.
        </p>
      </div>

      {formError ? <Alert>{formError}</Alert> : null}

      <Field label="Name" htmlFor="name" required error={errors.name}>
        <Input id="name" name="name" autoComplete="name" required aria-invalid={Boolean(errors.name)} />
      </Field>

      <Field label="Email" htmlFor="email" required error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(errors.email)}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        required
        error={errors.password}
        hint="At least 10 characters."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.password)}
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-[var(--color-ink-muted)]">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-[var(--color-primary)] hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function SignInForm({ notice }: { notice?: string }) {
  const { pending, setPending, formError, setFormError, errors, setErrors, onDone } =
    useAuthSubmit();

  async function handle(form: FormData) {
    setFormError(null);
    setErrors({});

    const parsed = signInSchema.safeParse({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setPending(true);
    const { error } = await signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setPending(false);

    if (error) {
      // Deliberately does not distinguish "no such account" from "wrong
      // password" -- that difference is an account-enumeration oracle.
      setFormError(
        tooManyAttempts(error) ? TOO_MANY : "That email and password do not match an account.",
      );
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit(handle)} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Welcome back.</p>
      </div>

      {notice && !formError ? <Alert tone="success">{notice}</Alert> : null}
      {formError ? <Alert>{formError}</Alert> : null}

      <Field label="Email" htmlFor="email" required error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(errors.email)}
        />
      </Field>

      <div>
        <Field label="Password" htmlFor="password" required error={errors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(errors.password)}
          />
        </Field>
        <p className="mt-1.5 text-right text-xs">
          <Link
            href="/forgot-password"
            className="font-medium text-[var(--color-primary)] hover:underline"
          >
            Forgot password?
          </Link>
        </p>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-[var(--color-ink-muted)]">
        New here?{" "}
        <Link href="/sign-up" className="font-medium text-[var(--color-primary)] hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { pending, setPending, formError, setFormError, errors, setErrors } = useAuthSubmit();
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handle(form: FormData) {
    setFormError(null);
    setErrors({});

    const parsed = forgotPasswordSchema.safeParse({
      email: String(form.get("email") ?? "").trim(),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setPending(true);
    const { error } = await requestPasswordReset({
      email: parsed.data.email,
      redirectTo: "/reset-password",
    });
    setPending(false);

    if (error && tooManyAttempts(error)) {
      setFormError(TOO_MANY);
      return;
    }
    if (error) {
      setFormError("Could not send a reset link right now. Please try again.");
      return;
    }
    // The same confirmation whether or not the address has an account, so this
    // page cannot be used to test which emails are registered.
    setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            If an account exists for <span className="font-medium">{sentTo}</span>, a link to choose
            a new password is on its way. It works once and expires in an hour.
          </p>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Nothing arrived? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="font-medium text-[var(--color-primary)] hover:underline"
          >
            try a different address
          </button>
          .
        </p>
        <Link href="/sign-in" className="block text-center text-sm font-medium text-[var(--color-primary)] hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit(handle)} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Enter the email you sign in with and we will send you a reset link.
        </p>
      </div>

      {formError ? <Alert>{formError}</Alert> : null}

      <Field label="Email" htmlFor="email" required error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(errors.email)}
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-center text-sm text-[var(--color-ink-muted)]">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium text-[var(--color-primary)] hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const { router, pending, setPending, formError, setFormError, errors, setErrors } =
    useAuthSubmit();

  async function handle(form: FormData) {
    if (!token) return;
    setFormError(null);
    setErrors({});

    const parsed = resetPasswordSchema.safeParse({
      password: String(form.get("password") ?? ""),
      confirm: String(form.get("confirm") ?? ""),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setPending(true);
    const { error } = await resetPassword({ newPassword: parsed.data.password, token });
    setPending(false);

    if (error) {
      setFormError(
        tooManyAttempts(error)
          ? TOO_MANY
          : "This reset link has expired or has already been used. Request a new one.",
      );
      return;
    }
    // Every session was revoked by the reset, including any this browser had,
    // so the user signs in again with the new password.
    router.push("/sign-in?reset=1");
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">This link does not work</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Reset links work once and expire after an hour. Request a new one and use the most
            recent email.
          </p>
        </div>
        <Link href="/forgot-password" className={buttonVariants({ size: "lg", className: "w-full" })}>
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit(handle)} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          You will be signed out everywhere, then asked to sign in with the new password.
        </p>
      </div>

      {formError ? (
        <Alert>
          {formError}{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
        </Alert>
      ) : null}

      <Field
        label="New password"
        htmlFor="password"
        required
        error={errors.password}
        hint="At least 10 characters."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.password)}
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirm" required error={errors.confirm}>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.confirm)}
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
