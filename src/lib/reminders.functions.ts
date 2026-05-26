import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RuleInput = z.object({
  id: z.string().uuid().optional(),
  caFirmId: z.string().uuid(),
  clientId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(120),
  triggerType: z.enum(["gst_due_offset", "monthly_day", "stale_upload_days", "manual"]),
  offsetDays: z.number().int().min(0).max(365).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  messageTemplate: z.string().trim().min(5).max(1000),
  channels: z.array(z.enum(["in_app", "email", "whatsapp"])).min(1),
  enabled: z.boolean().default(true),
});

async function assertFirmMember(userId: string, caFirmId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("ca_firm_id", caFirmId)
    .in("role", ["ca_owner", "ca_staff"])
    .limit(1);
  if (!data || data.length === 0) throw new Error("Forbidden");
}

export const listReminderRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caFirmId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFirmMember(context.userId, data.caFirmId);
    const { data: rows, error } = await supabaseAdmin
      .from("reminder_rules")
      .select("*")
      .eq("ca_firm_id", data.caFirmId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rules: rows ?? [] };
  });

export const upsertReminderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RuleInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFirmMember(context.userId, data.caFirmId);
    const payload = {
      ca_firm_id: data.caFirmId,
      client_id: data.clientId ?? null,
      name: data.name,
      trigger_type: data.triggerType,
      offset_days: data.offsetDays ?? null,
      day_of_month: data.dayOfMonth ?? null,
      message_template: data.messageTemplate,
      channels: data.channels,
      enabled: data.enabled,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("reminder_rules")
        .update(payload)
        .eq("id", data.id)
        .eq("ca_firm_id", data.caFirmId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("reminder_rules")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins!.id };
  });

export const deleteReminderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), caFirmId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFirmMember(context.userId, data.caFirmId);
    const { error } = await supabaseAdmin
      .from("reminder_rules")
      .delete()
      .eq("id", data.id)
      .eq("ca_firm_id", data.caFirmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listReminderHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caFirmId: z.string().uuid(), limit: z.number().int().max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFirmMember(context.userId, data.caFirmId);
    const { data: rows, error } = await supabaseAdmin
      .from("reminders")
      .select("*, clients(business_name)")
      .eq("ca_firm_id", data.caFirmId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { reminders: rows ?? [] };
  });

export const logReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      caFirmId: z.string().uuid(),
      clientId: z.string().uuid(),
      ruleId: z.string().uuid().nullable().optional(),
      channel: z.enum(["in_app", "email", "whatsapp"]),
      message: z.string().min(1).max(2000),
      dueForDate: z.string().nullable().optional(),
      status: z.enum(["scheduled", "sent", "skipped", "failed"]).default("sent"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFirmMember(context.userId, data.caFirmId);
    const { error } = await supabaseAdmin.from("reminders").insert({
      ca_firm_id: data.caFirmId,
      client_id: data.clientId,
      rule_id: data.ruleId ?? null,
      channel: data.channel,
      message: data.message,
      due_for_date: data.dueForDate ?? null,
      status: data.status,
      sent_at: data.status === "sent" ? new Date().toISOString() : null,
      sent_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Compute upcoming reminders based on rules. Pure read; does not enqueue.
 * Indian GST monthly due date approximated as the 20th of next month for GSTR-3B.
 */
export const computeUpcomingReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caFirmId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFirmMember(context.userId, data.caFirmId);
    const [{ data: rules }, { data: clients }, { data: lastInvoices }] = await Promise.all([
      supabaseAdmin.from("reminder_rules").select("*").eq("ca_firm_id", data.caFirmId).eq("enabled", true),
      supabaseAdmin.from("clients").select("id, business_name").eq("ca_firm_id", data.caFirmId),
      supabaseAdmin
        .from("invoices")
        .select("client_id, created_at")
        .eq("ca_firm_id", data.caFirmId)
        .order("created_at", { ascending: false }),
    ]);

    const lastUploadByClient = new Map<string, string>();
    for (const inv of lastInvoices ?? []) {
      if (!lastUploadByClient.has(inv.client_id)) lastUploadByClient.set(inv.client_id, inv.created_at);
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    // GSTR-3B: 20th of next month
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 20);
    const gstDue = nextMonth.toISOString().slice(0, 10);

    const upcoming: Array<{
      ruleId: string;
      ruleName: string;
      clientId: string;
      clientName: string;
      dueOn: string;
      reason: string;
      channels: string[];
      message: string;
    }> = [];

    for (const rule of rules ?? []) {
      const targets = (clients ?? []).filter((c) => !rule.client_id || c.id === rule.client_id);
      for (const c of targets) {
        let trigger = false;
        let dueOn = today;
        let reason = "";
        if (rule.trigger_type === "gst_due_offset") {
          const d = new Date(nextMonth);
          d.setDate(d.getDate() - (rule.offset_days ?? 7));
          dueOn = d.toISOString().slice(0, 10);
          reason = `${rule.offset_days ?? 7} days before GSTR-3B due (${gstDue})`;
          trigger = dueOn <= today;
        } else if (rule.trigger_type === "monthly_day") {
          const day = rule.day_of_month ?? 1;
          trigger = now.getDate() >= day;
          const d = new Date(now.getFullYear(), now.getMonth(), day);
          dueOn = d.toISOString().slice(0, 10);
          reason = `Monthly request on day ${day}`;
        } else if (rule.trigger_type === "stale_upload_days") {
          const last = lastUploadByClient.get(c.id);
          const days = rule.offset_days ?? 5;
          const cutoff = new Date(now.getTime() - days * 86400000);
          trigger = !last || new Date(last) < cutoff;
          dueOn = today;
          reason = last ? `No uploads in ${days} days` : `No uploads ever`;
        }
        if (!trigger) continue;
        upcoming.push({
          ruleId: rule.id,
          ruleName: rule.name,
          clientId: c.id,
          clientName: c.business_name,
          dueOn,
          reason,
          channels: rule.channels,
          message: rule.message_template
            .replace(/\{client\}/g, c.business_name)
            .replace(/\{firm\}/g, "your CA")
            .replace(/\{due_date\}/g, gstDue),
        });
      }
    }
    return { upcoming, gstDue };
  });
