import "server-only";

import { PAGE_SIZE, pageBounds, type Page } from "@/lib/pagination";

import { prisma } from "../db";

/**
 * Client data access.
 *
 * Every exported function takes `userId` as its first argument and puts it in
 * the where clause. There is no overload that omits it. A caller that does not
 * have a session cannot construct a call.
 *
 * Single-row reads use `findFirst({ where: { id, userId } })` rather than
 * `findUnique({ where: { id } })` followed by an ownership check -- the check
 * is inside the query, so there is no branch to forget.
 */

export interface ClientListItem {
  id: string;
  name: string;
  email: string;
  company: string | null;
  country: string;
  currency: string;
  archivedAt: Date | null;
  invoiceCount: number;
}

export async function listClients(
  userId: string,
  opts: { includeArchived?: boolean; search?: string; page?: number; pageSize?: number } = {},
): Promise<Page<ClientListItem>> {
  const { includeArchived = false, search, page: requested = 1, pageSize = PAGE_SIZE } = opts;

  const where = {
    userId,
    ...(includeArchived ? {} : { archivedAt: null }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { company: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const total = await prisma.client.count({ where });
  const { page, pageCount, skip, take } = pageBounds(total, requested, pageSize);

  const rows = await prisma.client.findMany({
    where,
    // id last: names repeat, and an offset page needs a total order.
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }, { id: "asc" }],
    skip,
    take,
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      country: true,
      currency: true,
      archivedAt: true,
      _count: { select: { invoices: true } },
    },
  });

  return {
    items: rows.map(({ _count, ...rest }) => ({ ...rest, invoiceCount: _count.invoices })),
    total,
    page,
    pageSize,
    pageCount,
  };
}

export async function getClient(userId: string, clientId: string) {
  return prisma.client.findFirst({
    where: { id: clientId, userId },
  });
}

/** Clients that can be billed. Archived clients are excluded from new invoices. */
export async function listBillableClients(userId: string) {
  return prisma.client.findMany({
    where: { userId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, currency: true, company: true },
  });
}

export interface ClientInput {
  name: string;
  email: string;
  company?: string | null;
  country: string;
  currency: string;
  addressLine?: string | null;
  notes?: string | null;
}

export async function createClient(userId: string, input: ClientInput) {
  return prisma.client.create({
    data: { ...input, userId },
  });
}

export async function updateClient(userId: string, clientId: string, input: ClientInput) {
  // updateMany, not update: `update` targets a unique id and cannot express the
  // userId condition, so it would happily edit another user's row. A count of
  // zero means "not yours or not there", which the caller reports as 404.
  const result = await prisma.client.updateMany({
    where: { id: clientId, userId },
    data: input,
  });
  return result.count > 0;
}

export async function setClientArchived(userId: string, clientId: string, archived: boolean) {
  const result = await prisma.client.updateMany({
    where: { id: clientId, userId },
    data: { archivedAt: archived ? new Date() : null },
  });
  return result.count > 0;
}

/**
 * Delete a client. Refused when invoices reference it -- the schema uses
 * onDelete: Restrict, and a freelancer who deletes a client mid-year would lose
 * the counterparty on filed invoices. Archiving is the intended path.
 */
export async function deleteClient(
  userId: string,
  clientId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "has_invoices" }> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, userId },
    select: { id: true, _count: { select: { invoices: true } } },
  });
  if (!client) return { ok: false, reason: "not_found" };
  if (client._count.invoices > 0) return { ok: false, reason: "has_invoices" };

  await prisma.client.deleteMany({ where: { id: clientId, userId } });
  return { ok: true };
}
