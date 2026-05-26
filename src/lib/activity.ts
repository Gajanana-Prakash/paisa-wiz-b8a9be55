import { supabase } from "@/integrations/supabase/client";

export type ActivityAction =
  | "document_uploaded"
  | "document_edited"
  | "invoice_approved"
  | "report_exported"
  | "document_request_sent"
  | "document_request_fulfilled"
  | "document_request_cancelled";

export type ActivityLog = {
  id: string;
  ca_firm_id: string;
  client_id: string;
  actor_user_id: string;
  actor_name: string | null;
  action: ActivityAction | string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
};

let cachedActor: { id: string; name: string | null } | null = null;

async function getActor() {
  if (cachedActor) return cachedActor;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", u.user.id)
    .maybeSingle();
  cachedActor = {
    id: u.user.id,
    name: (p?.full_name as string | null) ?? u.user.email ?? null,
  };
  return cachedActor;
}

export async function logActivity(args: {
  ca_firm_id: string;
  client_id: string;
  action: ActivityAction;
  entity_type?: string;
  entity_id?: string | null;
  metadata?: Record<string, any>;
}) {
  try {
    const actor = await getActor();
    if (!actor) return;
    await supabase.from("activity_logs").insert({
      ca_firm_id: args.ca_firm_id,
      client_id: args.client_id,
      actor_user_id: actor.id,
      actor_name: actor.name,
      action: args.action,
      entity_type: args.entity_type ?? null,
      entity_id: args.entity_id ?? null,
      metadata: args.metadata ?? {},
    });
  } catch (e) {
    // Logging must never break the user action
    console.warn("activity log failed", e);
  }
}
