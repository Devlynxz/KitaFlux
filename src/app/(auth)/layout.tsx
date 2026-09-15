import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { getSessionUser } from "@/server/session";

/**
 * Auth shell.
 *
 * A signed-in user who lands on /sign-in is sent to the dashboard rather than
 * shown a login form for the account they already have.
 *
 * Two columns on desktop: the form on the left, and a quiet product panel on
 * the right that states what the app does. The brand guide asks for auth that
 * is "simple, credible, product-focused", so the panel carries no testimonial
 * or marketing flourish -- just the three numbers the app tracks.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-8 sm:px-8">
        <Link href="/" aria-label="KitaFlux home">
          <Logo size="lg" />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      <aside className="relative hidden flex-col justify-center bg-[#0B1220] px-12 text-[#F8FAFC] lg:flex">
        <div className="max-w-md">
          <p className="text-sm font-medium text-[#7DD3FC]">Global income. Clear local numbers.</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
            Three numbers, not one.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[#CBD5E1]">
            What you invoiced, what the platform actually sent, and what landed in your bank in
            pesos after fees and forex. KitaFlux keeps all three, at the rate on the day the money
            arrived.
          </p>

          <dl className="mt-10 space-y-5">
            <div className="flex items-baseline justify-between gap-6 border-b border-[#243244] pb-4">
              <dt className="text-sm text-[#CBD5E1]">Invoiced</dt>
              <dd className="tabular text-lg font-semibold">$1,200.00</dd>
            </div>
            <div className="flex items-baseline justify-between gap-6 border-b border-[#243244] pb-4">
              <dt className="text-sm text-[#CBD5E1]">After platform fees</dt>
              <dd className="tabular text-lg font-semibold">$1,185.60</dd>
            </div>
            <div className="flex items-baseline justify-between gap-6">
              <dt className="text-sm text-[#CBD5E1]">Landed at 57.85</dt>
              <dd className="tabular text-lg font-semibold text-[#7DD3FC]">₱68,586.96</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
