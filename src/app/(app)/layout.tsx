import { AppShell } from "@/components/app/nav";
import { requireUser } from "@/server/session";

/**
 * The authenticated shell.
 *
 * Every route inside the (app) group is gated here. `requireUser` redirects to
 * /sign-in when there is no session, so no page under this layout has to check
 * for itself -- and none of them can forget to.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>
  );
}
