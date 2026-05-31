import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getClientRole(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("client_id, role")
    .eq("user_id", userId)
    .in("role", ["client_owner", "client_employee"])
    .limit(1)
    .maybeSingle();
  return data;
}

export const getClientLanguagePreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getClientRole(context.userId);
    if (!role?.client_id) return { language: "EN" as const };

    const { data } = await supabaseAdmin
      .from("client_users")
      .select("preferred_language")
      .eq("user_id", context.userId)
      .eq("client_id", role.client_id)
      .maybeSingle();

    const lang = data?.preferred_language === "HI" ? "HI" : "EN";
    return { language: lang as "EN" | "HI" };
  });

export const saveClientLanguagePreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ language: z.enum(["EN", "HI"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await getClientRole(context.userId);
    if (!role?.client_id) throw new Error("Not a client user");

    const { error } = await supabaseAdmin.from("client_users").upsert(
      {
        user_id: context.userId,
        client_id: role.client_id,
        preferred_language: data.language,
      },
      { onConflict: "user_id,client_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** CA-side: preferred language for WhatsApp templates (client owner's setting). */
export const getClientPreferredLanguageForCa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("ca_firm_id")
      .eq("id", data.clientId)
      .single();
    if (!client) throw new Error("Client not found");
    const { data: access } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("ca_firm_id", client.ca_firm_id)
      .limit(1);
    if (!access) throw new Error("Access denied");
    const lang = await getClientOwnerLanguage(data.clientId);
    return { language: lang };
  });

export async function getClientOwnerLanguage(clientId: string): Promise<"EN" | "HI"> {
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("owner_user_id")
    .eq("id", clientId)
    .maybeSingle();

  if (!client?.owner_user_id) {
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("client_id", clientId)
      .eq("role", "client_owner")
      .limit(1)
      .maybeSingle();
    if (!role?.user_id) return "EN";
    const { data: cu } = await supabaseAdmin
      .from("client_users")
      .select("preferred_language")
      .eq("user_id", role.user_id)
      .eq("client_id", clientId)
      .maybeSingle();
    return cu?.preferred_language === "HI" ? "HI" : "EN";
  }

  const { data: cu } = await supabaseAdmin
    .from("client_users")
    .select("preferred_language")
    .eq("user_id", client.owner_user_id)
    .eq("client_id", clientId)
    .maybeSingle();
  return cu?.preferred_language === "HI" ? "HI" : "EN";
}
