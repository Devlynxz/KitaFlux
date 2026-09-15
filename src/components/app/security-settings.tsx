"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, CardTitle, Field, Input } from "@/components/ui/primitives";
import { changePassword, revokeOtherSessions } from "@/lib/auth-client";
import { changePasswordSchema, fieldErrors } from "@/lib/validation";

import { ConfirmDialog } from "./confirm-dialog";
import { Toast } from "./toast";

/**
 * Password and session controls.
 *
 * A separate card and a separate form from the profile: it talks to Better
 * Auth's client rather than a server action (the client is what re-issues the
 * session cookie after a password change), and it must not share a submit
 * button with fields that are printed on invoices.
 *
 * Changing the password always signs out every other device. Offering it as an
 * opt-out checkbox would make the safe choice the one people have to notice.
 */
export function SecuritySettings() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const parsed = changePasswordSchema.safeParse({
      currentPassword: String(form.get("currentPassword") ?? ""),
      password: String(form.get("password") ?? ""),
      confirm: String(form.get("confirm") ?? ""),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setPending(true);
    const { error } = await changePassword({
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.password,
      revokeOtherSessions: true,
    });
    setPending(false);

    if (error) {
      if (error.status === 429) {
        setFormError("Too many attempts. Wait a few minutes, then try again.");
      } else if (error.code === "INVALID_PASSWORD") {
        setErrors({ currentPassword: "That is not your current password." });
      } else {
        setFormError("Could not change your password. Please try again.");
      }
      return;
    }

    formRef.current?.reset();
    setToast("Password changed. Every other device has been signed out.");
    router.refresh();
  }

  async function onRevoke() {
    setConfirmRevoke(false);
    setPending(true);
    const { error } = await revokeOtherSessions();
    setPending(false);
    if (error) {
      setFormError("Could not sign out other devices. Please try again.");
      return;
    }
    setToast("Signed out of every other device.");
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Password and sessions</CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? <Alert>{formError}</Alert> : null}

          {/* Lets password managers pair the new password with this account. */}
          <input type="text" name="username" autoComplete="username" hidden readOnly />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Current password"
              htmlFor="currentPassword"
              required
              error={errors.currentPassword}
            >
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.currentPassword)}
              />
            </Field>
            <Field
              label="New password"
              htmlFor="newPassword"
              required
              error={errors.password}
              hint="At least 10 characters."
            >
              <Input
                id="newPassword"
                name="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
              />
            </Field>
            <Field label="Confirm new password" htmlFor="confirmPassword" required error={errors.confirm}>
              <Input
                id="confirmPassword"
                name="confirm"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirm)}
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Saving…" : "Change password"}
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Signed in on a shared or lost device? End every session except this one.
          </p>
          <Button variant="secondary" onClick={() => setConfirmRevoke(true)} disabled={pending}>
            Sign out other devices
          </Button>
        </div>
      </CardBody>

      <ConfirmDialog
        open={confirmRevoke}
        title="Sign out of every other device?"
        description="You stay signed in here. Anywhere else will need the password again."
        confirmLabel="Sign them out"
        onConfirm={onRevoke}
        onCancel={() => setConfirmRevoke(false)}
      />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </Card>
  );
}
