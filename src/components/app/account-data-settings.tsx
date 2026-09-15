"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Download, TriangleAlert } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, CardTitle, Field, Input } from "@/components/ui/primitives";
import { deleteUser } from "@/lib/auth-client";

/**
 * Export and deletion, on one card so the export sits directly above the
 * irreversible action it should come before.
 *
 * Deletion asks for two things, and they do different jobs:
 *   - typing the account email is a speed bump against a wrong-tab click; it is
 *     checked here only, because it proves nothing about who is typing;
 *   - the password is the real gate, verified by the server (see the
 *     `/delete-user` hook in server/auth.ts, which refuses any request without
 *     one and is rate limited).
 */
export function AccountDataSettings({
  email,
  counts,
}: {
  email: string;
  counts: { clients: number; invoices: number; payments: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const emailMatches = confirmEmail.trim().toLowerCase() === email.toLowerCase();
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  async function onDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPasswordError(null);
    if (!emailMatches) return;
    if (!password) {
      setPasswordError("Enter your password.");
      return;
    }

    setPending(true);
    const { error: failure } = await deleteUser({ password });
    setPending(false);

    if (failure) {
      if (failure.status === 429) {
        setError("Too many attempts. Wait a few minutes, then try again.");
      } else if (failure.code === "INVALID_PASSWORD") {
        setPasswordError("That is not your current password.");
      } else {
        setError("Your account could not be deleted. Nothing was removed — please try again.");
      }
      return;
    }

    // The session cookie was cleared by the response; replace so Back does
    // not return to a settings page for an account that no longer exists.
    router.replace("/sign-in?deleted=1");
    router.refresh();
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Your data</CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-[var(--color-ink-muted)]">
            <p>
              Download every client, invoice, line item and payment, plus your business details,
              as one JSON file.
            </p>
            <p className="mt-1 text-xs text-[var(--color-ink-subtle)]">
              Amounts keep their exact stored figures. Your password and sign-in sessions are not
              included.
            </p>
          </div>
          <a
            href="/settings/export"
            download
            className={buttonVariants({ variant: "secondary", className: "shrink-0" })}
          >
            <Download /> Export my data
          </a>
        </div>

        <div className="border-t pt-5">
          <h3 className="text-sm font-semibold text-[var(--color-danger)]">Delete account</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Permanently deletes your account, {plural(counts.clients, "client")},{" "}
            {plural(counts.invoices, "invoice")} and {plural(counts.payments, "payment")}. It cannot
            be undone, and KitaFlux keeps no copy.
          </p>

          {!open ? (
            <Button variant="secondary" className="mt-3" onClick={() => setOpen(true)}>
              Delete my account…
            </Button>
          ) : (
            <form onSubmit={onDelete} className="mt-4 space-y-4" noValidate>
              <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--color-warning-soft)] px-4 py-3 text-sm text-[var(--color-warning-ink)]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p>
                  Invoices and payment records are part of the books you may need to keep after
                  filing. <strong>Export your data first</strong> if you might need them.
                </p>
              </div>

              {error ? <Alert>{error}</Alert> : null}

              {/* Lets a password manager fill the right account. */}
              <input type="text" name="username" autoComplete="username" value={email} hidden readOnly />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={`Type ${email} to confirm`}
                  htmlFor="confirmDeleteEmail"
                  required
                >
                  <Input
                    id="confirmDeleteEmail"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    inputMode="email"
                  />
                </Field>
                <Field label="Your password" htmlFor="deletePassword" required error={passwordError ?? undefined}>
                  <Input
                    id="deletePassword"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    aria-invalid={Boolean(passwordError)}
                  />
                </Field>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    setConfirmEmail("");
                    setPassword("");
                    setError(null);
                    setPasswordError(null);
                  }}
                  disabled={pending}
                >
                  Keep my account
                </Button>
                <Button type="submit" variant="danger" disabled={!emailMatches || pending}>
                  {pending ? "Deleting…" : "Permanently delete account"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
