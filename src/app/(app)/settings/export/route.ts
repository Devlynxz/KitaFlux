import { NextResponse } from "next/server";

import { exportAccount } from "@/server/data/account";
import { getSessionUser } from "@/server/session";

// Reads straight from the database on every request; a cached export would
// hand one user yesterday's records, or worse, someone else's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download everything KitaFlux holds about the signed-in user.
 * See server/data/account.ts for what is and is not included.
 */
export async function GET() {
  const user = await getSessionUser();
  // 401 rather than a redirect: this URL is fetched as a file download, where
  // a redirect to the sign-in page would save an HTML page as "export.json".
  if (!user) {
    return NextResponse.json({ error: "Sign in to export your data." }, { status: 401 });
  }

  const data = await exportAccount(user.id);
  if (!data) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const day = data.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kitaflux-export-${day}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
