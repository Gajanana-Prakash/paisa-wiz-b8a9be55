import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getOwnerFirmId(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("ca_firm_id")
    .eq("user_id", userId)
    .eq("role", "ca_owner")
    .limit(1)
    .maybeSingle();
  if (!data?.ca_firm_id) throw new Error("Only CA owners can import clients");
  return data.ca_firm_id;
}

function randomToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

const ClientRow = z.object({
  business_name: z.string().trim().min(1).max(200),
  gstin: z.string().trim().max(20).optional().or(z.literal("")),
  pan: z.string().trim().max(15).optional().or(z.literal("")),
  contact_name: z.string().trim().max(120).optional().or(z.literal("")),
  contact_email: z.string().trim().max(255).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(30).optional().or(z.literal("")),
});

export const checkImportDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rows: z.array(ClientRow).min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getOwnerFirmId(context.userId);
    const { data: existing } = await supabaseAdmin
      .from("clients")
      .select("business_name, gstin")
      .eq("ca_firm_id", firmId);

    const exGstin = new Set(
      (existing ?? [])
        .map((c) => (c.gstin ?? "").toUpperCase().trim())
        .filter(Boolean),
    );
    const exName = new Set(
      (existing ?? []).map((c) => c.business_name.toLowerCase().trim()),
    );

    const flagged = data.rows.map((r, i) => {
      const gstin = (r.gstin ?? "").toUpperCase().trim();
      const isDupe =
        (gstin && exGstin.has(gstin)) ||
        exName.has(r.business_name.toLowerCase().trim());
      return { index: i, duplicate: isDupe };
    });
    return { duplicates: flagged.filter((f) => f.duplicate).length, flagged };
  });

export const commitClientImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rows: z.array(ClientRow).min(1).max(2000),
        skipDuplicates: z.boolean().default(true),
        sendInvites: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getOwnerFirmId(context.userId);

    let dupSkipped = 0;
    let toInsert = data.rows;
    if (data.skipDuplicates) {
      const { data: existing } = await supabaseAdmin
        .from("clients")
        .select("business_name, gstin")
        .eq("ca_firm_id", firmId);
      const exGstin = new Set(
        (existing ?? [])
          .map((c) => (c.gstin ?? "").toUpperCase().trim())
          .filter(Boolean),
      );
      const exName = new Set(
        (existing ?? []).map((c) => c.business_name.toLowerCase().trim()),
      );
      toInsert = data.rows.filter((r) => {
        const g = (r.gstin ?? "").toUpperCase().trim();
        const isDupe =
          (g && exGstin.has(g)) || exName.has(r.business_name.toLowerCase().trim());
        if (isDupe) dupSkipped++;
        return !isDupe;
      });
    }

    if (toInsert.length === 0) {
      return { imported: 0, duplicatesSkipped: dupSkipped, invitesCreated: 0 };
    }

    const inserts = toInsert.map((r) => ({
      ca_firm_id: firmId,
      business_name: r.business_name,
      gstin: r.gstin ? r.gstin.toUpperCase() : null,
      contact_name: r.contact_name || null,
      contact_email: r.contact_email || null,
      contact_phone: r.contact_phone || null,
      status: "pending_invite" as const,
    }));

    const { data: created, error } = await supabaseAdmin
      .from("clients")
      .insert(inserts)
      .select("id, contact_email");
    if (error) throw new Error(error.message);

    let invitesCreated = 0;
    if (data.sendInvites && created && created.length) {
      const invites = created.map((c) => ({
        ca_firm_id: firmId,
        client_id: c.id,
        token: randomToken(),
        email: c.contact_email || null,
        created_by: context.userId,
      }));
      const { error: invErr } = await supabaseAdmin
        .from("client_invites")
        .insert(invites);
      if (!invErr) invitesCreated = invites.length;
    }

    return {
      imported: created?.length ?? 0,
      duplicatesSkipped: dupSkipped,
      invitesCreated,
    };
  });
