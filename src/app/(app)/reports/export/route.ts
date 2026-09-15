import { NextResponse } from "next/server";

import { quarterOf, type Quarter } from "@/lib/dates";
import { getQuarterlyCsv } from "@/server/data/reports";
import { getSessionUser } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseQuarter(value: string | null): Quarter {
  const match = /^(\d{4})-Q([1-4])$/.exec(value ?? "");
  if (!match) return quarterOf(new Date());

  const year = Number(match[1]);
  // Bound the year so a crafted query cannot ask for an absurd range.
  if (year < 2000 || year > 2100) return quarterOf(new Date());

  return { year, quarter: Number(match[2]) as 1 | 2 | 3 | 4 };
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
  }

  const url = new URL(request.url);
  const quarter = parseQuarter(url.searchParams.get("q"));
  const csv = await getQuarterlyCsv(user.id, quarter, user.homeCurrency);
  const filename = `kitaflux-${quarter.year}-Q${quarter.quarter}.csv`;

  // The BOM makes Excel open a UTF-8 CSV correctly. Without it, a peso sign in
  // a client name renders as mojibake, which is the first thing an accountant
  // notices.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
