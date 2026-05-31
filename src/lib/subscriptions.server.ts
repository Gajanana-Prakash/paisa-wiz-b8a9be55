import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  calculateSubscriptionAmount,
  type BillingCycle,
  type PlanType,
} from "./subscriptions.plans";

export * from "./subscriptions.plans";

export async function countActiveClients(caFirmId: string): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("ca_firm_id", caFirmId)
    .neq("status", "pending_invite");

  const clientIds = (clients ?? []).map((c) => c.id);
  if (!clientIds.length) return 0;

  const activeSet = new Set<string>();

  const [invRes, docRes, taskRes] = await Promise.all([
    supabaseAdmin
      .from("invoices")
      .select("client_id")
      .in("client_id", clientIds)
      .gte("created_at", sinceIso),
    supabaseAdmin
      .from("document_vault")
      .select("client_id")
      .in("client_id", clientIds)
      .gte("created_at", sinceIso),
    supabaseAdmin
      .from("tasks")
      .select("client_id")
      .eq("ca_firm_id", caFirmId)
      .not("client_id", "is", null)
      .gte("updated_at", sinceIso),
  ]);

  for (const row of invRes.data ?? []) if (row.client_id) activeSet.add(row.client_id);
  for (const row of docRes.data ?? []) if (row.client_id) activeSet.add(row.client_id);
  for (const row of taskRes.data ?? []) if (row.client_id) activeSet.add(row.client_id);

  return activeSet.size;
}

export type ActiveClientRow = {
  id: string;
  businessName: string;
  lastActivityAt: string | null;
};

export async function listActiveClientsDetail(caFirmId: string): Promise<ActiveClientRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, business_name")
    .eq("ca_firm_id", caFirmId)
    .neq("status", "pending_invite");

  if (!clients?.length) return [];

  const clientIds = clients.map((c) => c.id);
  const lastByClient = new Map<string, string>();

  const merge = (clientId: string | null, at: string | null) => {
    if (!clientId || !at) return;
    const prev = lastByClient.get(clientId);
    if (!prev || at > prev) lastByClient.set(clientId, at);
  };

  const [invRes, docRes, taskRes] = await Promise.all([
    supabaseAdmin
      .from("invoices")
      .select("client_id, created_at")
      .in("client_id", clientIds)
      .gte("created_at", sinceIso),
    supabaseAdmin
      .from("document_vault")
      .select("client_id, created_at")
      .in("client_id", clientIds)
      .gte("created_at", sinceIso),
    supabaseAdmin
      .from("tasks")
      .select("client_id, updated_at")
      .eq("ca_firm_id", caFirmId)
      .not("client_id", "is", null)
      .gte("updated_at", sinceIso),
  ]);

  for (const row of invRes.data ?? []) merge(row.client_id, row.created_at);
  for (const row of docRes.data ?? []) merge(row.client_id, row.created_at);
  for (const row of taskRes.data ?? []) merge(row.client_id, row.updated_at);

  return clients
    .filter((c) => lastByClient.has(c.id))
    .map((c) => ({
      id: c.id,
      businessName: c.business_name,
      lastActivityAt: lastByClient.get(c.id) ?? null,
    }))
    .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
}

export async function ensureSubscription(caFirmId: string) {
  const { data: existing } = await supabaseAdmin
    .from("ca_subscriptions")
    .select("*")
    .eq("ca_firm_id", caFirmId)
    .maybeSingle();

  if (existing) {
    await refreshSubscriptionMetrics(existing.id, caFirmId);
    const { data: updated } = await supabaseAdmin
      .from("ca_subscriptions")
      .select("*")
      .eq("id", existing.id)
      .single();
    return updated!;
  }

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  const periodStart = new Date().toISOString().slice(0, 10);
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { data: created, error } = await supabaseAdmin
    .from("ca_subscriptions")
    .insert({
      ca_firm_id: caFirmId,
      plan_type: "FREE",
      billing_cycle: "MONTHLY",
      status: "TRIAL",
      trial_ends_at: trialEnd.toISOString(),
      current_period_start: periodStart,
      current_period_end: periodEnd.toISOString().slice(0, 10),
      base_clients_included: 3,
      monthly_amount: 0,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return created!;
}

export async function refreshSubscriptionMetrics(subscriptionId: string, caFirmId: string) {
  const active = await countActiveClients(caFirmId);
  const { data: sub } = await supabaseAdmin
    .from("ca_subscriptions")
    .select("plan_type, billing_cycle")
    .eq("id", subscriptionId)
    .single();

  if (!sub) return;

  const amount = calculateSubscriptionAmount(
    sub.plan_type as PlanType,
    sub.billing_cycle as BillingCycle,
    active,
  );

  await supabaseAdmin
    .from("ca_subscriptions")
    .update({
      active_client_count: active,
      monthly_amount: amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId);
}
