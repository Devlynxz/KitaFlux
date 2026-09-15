import { serve } from "inngest/next";

import { inngest } from "@/server/inngest/client";
import { functions } from "@/server/inngest/functions";

export const runtime = "nodejs";

// signingKey is configured on the Inngest client, not here.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
