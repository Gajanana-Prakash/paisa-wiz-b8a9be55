import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getUserFirmAndClientAccess(userId: string): Promise<{ caFirmId: string | null; clientIds: string[]; isCAMember: boolean }> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("ca_firm_id, client_id, role")
    .eq("user_id", userId);
  let caFirmId: string | null = null;
  const clientIds: string[] = [];
  let isCAMember = false;
  for (const r of data ?? []) {
    if (r.role === "ca_owner" || r.role === "ca_staff") {
      caFirmId = r.ca_firm_id as string;
      isCAMember = true;
    }
    if (r.client_id && (r.role === "client_owner" || r.role === "client_employee")) {
      clientIds.push(r.client_id as string);
    }
  }
  return { caFirmId, clientIds, isCAMember };
}

export async function assertClientAccess(userId: string, clientId: string): Promise<{ caFirmId: string; isCAMember: boolean }> {
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, ca_firm_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) throw new Error("Client not found");
  const access = await getUserFirmAndClientAccess(userId);
  const caMatches = access.caFirmId === client.ca_firm_id;
  const clientMatches = access.clientIds.includes(clientId);
  if (!caMatches && !clientMatches) throw new Error("Access denied");
  return { caFirmId: client.ca_firm_id as string, isCAMember: caMatches };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
