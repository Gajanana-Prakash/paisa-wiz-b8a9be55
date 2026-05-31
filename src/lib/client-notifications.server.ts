import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function insertClientNotification(opts: {
  caFirmId: string;
  clientId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string;
  link?: string;
}) {
  await supabaseAdmin.from("client_notifications").insert({
    ca_firm_id: opts.caFirmId,
    client_id: opts.clientId,
    user_id: opts.userId ?? null,
    type: opts.type,
    title: opts.title,
    body: opts.body ?? null,
    link: opts.link ?? null,
  });
}

/** Notify all client portal users for a business. */
export async function notifyClientPortal(opts: {
  caFirmId: string;
  clientId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("client_id", opts.clientId)
    .in("role", ["client_owner", "client_employee"]);

  const userIds = (roles ?? []).map((r) => r.user_id).filter(Boolean) as string[];
  if (!userIds.length) {
    await insertClientNotification({ ...opts, userId: null });
    return;
  }
  for (const userId of userIds) {
    await insertClientNotification({ ...opts, userId });
  }
}
