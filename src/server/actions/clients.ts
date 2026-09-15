"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clientSchema } from "@/lib/validation";

import {
  createClient,
  deleteClient,
  setClientArchived,
  updateClient,
} from "../data/clients";
import { requireUserId } from "../session";
import { field, toActionState, type ActionState } from "./shared";

function parse(form: FormData) {
  return clientSchema.parse({
    name: field(form, "name"),
    email: field(form, "email"),
    company: field(form, "company"),
    country: field(form, "country").toUpperCase(),
    currency: field(form, "currency").toUpperCase(),
    addressLine: field(form, "addressLine"),
    notes: field(form, "notes"),
  });
}

export async function createClientAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const userId = await requireUserId();
    const values = parse(form);
    const created = await createClient(userId, {
      ...values,
      company: values.company || null,
      addressLine: values.addressLine || null,
      notes: values.notes || null,
    });
    id = created.id;
  } catch (error) {
    return toActionState(error);
  }

  // redirect() throws a control-flow signal, so it must sit outside the try or
  // the catch above would swallow it and report a generic failure.
  revalidatePath("/clients");
  redirect(`/clients/${id}`);
}

export async function updateClientAction(
  clientId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const values = parse(form);
    const updated = await updateClient(userId, clientId, {
      ...values,
      company: values.company || null,
      addressLine: values.addressLine || null,
      notes: values.notes || null,
    });
    if (!updated) return { ok: false, message: "That client does not exist." };
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function archiveClientAction(
  clientId: string,
  archived: boolean,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const done = await setClientArchived(userId, clientId, archived);
    if (!done) return { ok: false, message: "That client does not exist." };

    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: archived ? "Client archived." : "Client restored." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteClientAction(clientId: string): Promise<ActionState> {
  let result;
  try {
    const userId = await requireUserId();
    result = await deleteClient(userId, clientId);
  } catch (error) {
    return toActionState(error);
  }

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "has_invoices"
          ? "This client has invoices, so it cannot be deleted. Archive it instead to keep those records intact."
          : "That client does not exist.",
    };
  }

  revalidatePath("/clients");
  redirect("/clients");
}
