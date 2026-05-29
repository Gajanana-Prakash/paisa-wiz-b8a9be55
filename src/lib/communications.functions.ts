import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess } from "./timetracking.server";

const ChannelEnum = z.enum(["IN_APP", "EMAIL", "WHATSAPP", "PHONE_CALL", "MEETING", "NOTE"]);
const DirectionEnum = z.enum(["INBOUND", "OUTBOUND", "INTERNAL_NOTE"]);
const CallTypeEnum = z.enum(["INBOUND", "OUTBOUND"]);

async function assertClientInFirm(clientId: string, firmId: string) {
  const { data } = await supabaseAdmin.from("clients").select("id").eq("id", clientId).eq("ca_firm_id", firmId).maybeSingle();
  if (!data) throw new Error("Client not found in this firm");
}

async function profileNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, (p.full_name as string) || "Unknown"]));
}

async function notifyFirmUsers(
  firmId: string,
  opts: { title: string; body?: string; link?: string; userId?: string | null },
) {
  await supabaseAdmin.from("ca_notifications").insert({
    ca_firm_id: firmId,
    user_id: opts.userId ?? null,
    type: "message",
    title: opts.title,
    body: opts.body ?? null,
    link: opts.link ?? null,
  });
}

export type TimelineItem = {
  id: string;
  kind: "conversation" | "call";
  channel: string;
  direction: string;
  subject: string | null;
  body: string;
  sent_by: string | null;
  sent_at: string;
  is_pinned: boolean;
  linked_task_id: string | null;
  sender_name?: string;
  attachments?: Array<{ id: string; file_url: string; file_name: string; file_size: number | null }>;
  call_log_id?: string | null;
};

function mergeTimeline(convs: any[], calls: any[], names: Map<string, string>): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const c of convs) {
    items.push({
      id: c.id,
      kind: "conversation",
      channel: c.channel,
      direction: c.direction,
      subject: c.subject,
      body: c.body,
      sent_by: c.sent_by,
      sent_at: c.sent_at,
      is_pinned: c.is_pinned,
      linked_task_id: c.linked_task_id,
      sender_name: c.sent_by ? names.get(c.sent_by) : c.direction === "INBOUND" ? "Client" : "System",
      attachments: c.attachments,
      call_log_id: c.call_log_id,
    });
  }
  for (const cl of calls) {
    if (convs.some((c) => c.call_log_id === cl.id)) continue;
    const body = [
      cl.outcome,
      cl.duration_minutes ? `Duration: ${cl.duration_minutes} min` : null,
      cl.follow_up_required ? `Follow-up: ${cl.follow_up_date ?? "TBD"}` : null,
    ].filter(Boolean).join("\n");
    items.push({
      id: `call-${cl.id}`,
      kind: "call",
      channel: "PHONE_CALL",
      direction: cl.call_type === "INBOUND" ? "INBOUND" : "OUTBOUND",
      subject: null,
      body: body || "Phone call logged",
      sent_by: cl.staff_user_id,
      sent_at: `${cl.call_date}T${cl.call_time}`,
      is_pinned: false,
      linked_task_id: cl.follow_up_task_id,
      sender_name: names.get(cl.staff_user_id),
      call_log_id: cl.id,
    });
  }
  return items.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
}

export const listClientTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid(),
      channel: ChannelEnum.optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    await assertClientInFirm(data.clientId, firmId);

    let cq = supabaseAdmin
      .from("client_conversations")
      .select("*, attachments:client_conversation_attachments(id, file_url, file_name, file_size)")
      .eq("client_id", data.clientId)
      .eq("ca_firm_id", firmId)
      .order("sent_at", { ascending: false })
      .limit(300);
    if (data.channel && data.channel !== "ALL") cq = cq.eq("channel", data.channel);

    const { data: convs } = await cq;
    const { data: calls } = await supabaseAdmin
      .from("call_logs")
      .select("*")
      .eq("client_id", data.clientId)
      .eq("ca_firm_id", firmId)
      .order("call_date", { ascending: false })
      .limit(100);

    const ids = Array.from(
      new Set([
        ...(convs ?? []).map((c) => c.sent_by).filter(Boolean),
        ...(calls ?? []).map((c) => c.staff_user_id),
      ]),
    ) as string[];
    const names = await profileNames(ids);
    const timeline = mergeTimeline(convs ?? [], calls ?? [], names);
    const counts: Record<string, number> = { ALL: timeline.length };
    for (const t of timeline) counts[t.channel] = (counts[t.channel] ?? 0) + 1;

    return {
      timeline,
      pinned: timeline.filter((t) => t.is_pinned),
      counts,
    };
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid(),
      channel: ChannelEnum,
      direction: DirectionEnum.default("OUTBOUND"),
      subject: z.string().max(300).nullable().optional(),
      body: z.string().min(1).max(20000),
      linkedTaskId: z.string().uuid().nullable().optional(),
      parentConversationId: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    await assertClientInFirm(data.clientId, firmId);

    const { data: row, error } = await supabaseAdmin
      .from("client_conversations")
      .insert({
        ca_firm_id: firmId,
        client_id: data.clientId,
        channel: data.channel,
        direction: data.direction,
        subject: data.subject ?? null,
        body: data.body,
        sent_by: context.userId,
        parent_conversation_id: data.parentConversationId ?? null,
        linked_task_id: data.linkedTaskId ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const logCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid(),
      callType: CallTypeEnum,
      callDate: z.string(),
      callTime: z.string(),
      durationMinutes: z.number().int().min(0).nullable().optional(),
      outcome: z.string().min(1).max(5000),
      followUpRequired: z.boolean().default(false),
      followUpDate: z.string().nullable().optional(),
      followUpNote: z.string().max(1000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    await assertClientInFirm(data.clientId, firmId);

    let followUpTaskId: string | null = null;
    if (data.followUpRequired) {
      const { data: client } = await supabaseAdmin.from("clients").select("business_name").eq("id", data.clientId).single();
      const { data: task } = await supabaseAdmin
        .from("tasks")
        .insert({
          ca_firm_id: firmId,
          client_id: data.clientId,
          created_by: context.userId,
          assigned_to: context.userId,
          title: `Follow up with ${client?.business_name ?? "client"}`,
          description: data.followUpNote ?? data.outcome,
          task_type: "OTHER",
          priority: "MEDIUM",
          due_date: data.followUpDate ?? null,
          status: "TODO",
        })
        .select("id")
        .single();
      followUpTaskId = task?.id ?? null;
    }

    const { data: call, error: cErr } = await supabaseAdmin
      .from("call_logs")
      .insert({
        ca_firm_id: firmId,
        client_id: data.clientId,
        staff_user_id: context.userId,
        call_type: data.callType,
        call_date: data.callDate,
        call_time: data.callTime,
        duration_minutes: data.durationMinutes ?? null,
        outcome: data.outcome,
        follow_up_required: data.followUpRequired,
        follow_up_date: data.followUpDate ?? null,
        follow_up_note: data.followUpNote ?? null,
        follow_up_task_id: followUpTaskId,
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    const summary = [
      data.outcome,
      data.durationMinutes ? `(${data.durationMinutes} min)` : null,
      data.followUpRequired ? `Follow-up scheduled` : null,
    ].filter(Boolean).join(" — ");

    const { data: conv } = await supabaseAdmin
      .from("client_conversations")
      .insert({
        ca_firm_id: firmId,
        client_id: data.clientId,
        channel: "PHONE_CALL",
        direction: data.callType === "INBOUND" ? "INBOUND" : "OUTBOUND",
        body: summary,
        sent_by: context.userId,
        call_log_id: call!.id,
        linked_task_id: followUpTaskId,
      })
      .select("id")
      .single();

    return { callId: call!.id, conversationId: conv?.id, followUpTaskId };
  });

export const toggleConversationPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { error } = await supabaseAdmin
      .from("client_conversations")
      .update({ is_pinned: data.pinned })
      .eq("id", data.id)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addConversationAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      conversationId: z.string().uuid(),
      fileUrl: z.string().url(),
      fileName: z.string().max(255),
      fileSize: z.number().int().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: conv } = await supabaseAdmin
      .from("client_conversations")
      .select("id")
      .eq("id", data.conversationId)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!conv) throw new Error("Conversation not found");
    const { error } = await supabaseAdmin.from("client_conversation_attachments").insert({
      conversation_id: data.conversationId,
      file_url: data.fileUrl,
      file_name: data.fileName,
      file_size: data.fileSize ?? null,
      uploaded_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listFirmCommunications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid().optional(),
      staffId: z.string().uuid().optional(),
      channel: ChannelEnum.optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      search: z.string().max(100).optional(),
      limit: z.number().int().max(200).default(80),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    let q = supabaseAdmin
      .from("client_conversations")
      .select("*, clients(business_name)")
      .eq("ca_firm_id", firmId)
      .order("sent_at", { ascending: false })
      .limit(data.limit);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.staffId) q = q.eq("sent_by", data.staffId);
    if (data.channel) q = q.eq("channel", data.channel);
    if (data.dateFrom) q = q.gte("sent_at", data.dateFrom);
    if (data.dateTo) q = q.lte("sent_at", data.dateTo);
    const { data: rows } = await q;
    let list = rows ?? [];
    if (data.search?.trim()) {
      const s = data.search.trim().toLowerCase();
      list = list.filter(
        (r: any) =>
          r.body?.toLowerCase().includes(s) ||
          r.subject?.toLowerCase().includes(s) ||
          r.clients?.business_name?.toLowerCase().includes(s),
      );
    }
    const ids = Array.from(new Set(list.map((r: any) => r.sent_by).filter(Boolean))) as string[];
    const names = await profileNames(ids);
    return list.map((r: any) => ({ ...r, staff_name: r.sent_by ? names.get(r.sent_by) : null }));
  });

export const listFollowUps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabaseAdmin
      .from("call_logs")
      .select("*, clients(business_name)")
      .eq("ca_firm_id", firmId)
      .eq("follow_up_required", true)
      .is("follow_up_completed_at", null)
      .order("follow_up_date", { ascending: true });
    const ids = Array.from(new Set((data ?? []).map((r) => r.staff_user_id)));
    const names = await profileNames(ids);
    return (data ?? []).map((r: any) => ({
      ...r,
      staff_name: names.get(r.staff_user_id),
      is_due_today: r.follow_up_date === today,
      is_overdue: r.follow_up_date && r.follow_up_date < today,
    }));
  });

export const completeFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ callLogId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { error } = await supabaseAdmin
      .from("call_logs")
      .update({ follow_up_completed_at: new Date().toISOString() })
      .eq("id", data.callLogId)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ========== CLIENT PORTAL ========== */

export const listClientInAppMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("client_id, role")
      .eq("user_id", context.userId);
    const clientRole = roles?.find((r) => r.role === "client_owner" || r.role === "client_employee");
    if (!clientRole?.client_id) throw new Error("Not a client user");

    const { data: rows } = await supabaseAdmin
      .from("client_conversations")
      .select("id, body, direction, sent_at, sent_by, subject")
      .eq("client_id", clientRole.client_id)
      .eq("channel", "IN_APP")
      .order("sent_at", { ascending: true })
      .limit(200);

    const caIds = Array.from(new Set((rows ?? []).filter((r) => r.direction === "OUTBOUND").map((r) => r.sent_by).filter(Boolean))) as string[];
    const names = await profileNames(caIds);

    const { data: reads } = await supabaseAdmin
      .from("client_conversation_reads")
      .select("conversation_id")
      .eq("user_id", context.userId);
    const readSet = new Set((reads ?? []).map((r) => r.conversation_id));

    const unread = (rows ?? []).filter((r) => r.direction === "OUTBOUND" && !readSet.has(r.id)).length;

    return {
      messages: (rows ?? []).map((r) => ({
        ...r,
        sender_label: r.direction === "OUTBOUND" ? (names.get(r.sent_by!) ?? "Your CA") : "You",
        is_mine: r.direction === "INBOUND",
      })),
      unread,
      clientId: clientRole.client_id,
      canReply: (rows ?? []).some((r) => r.direction === "OUTBOUND"),
    };
  });

export const clientReplyMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ body: z.string().min(1).max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("client_id, ca_firm_id")
      .eq("user_id", context.userId)
      .in("role", ["client_owner", "client_employee"]);
    const role = roles?.[0];
    if (!role?.client_id) throw new Error("Not a client user");

    const { data: lastCa } = await supabaseAdmin
      .from("client_conversations")
      .select("id")
      .eq("client_id", role.client_id)
      .eq("channel", "IN_APP")
      .eq("direction", "OUTBOUND")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastCa) throw new Error("Your CA has not started a conversation yet");

    const { data: client } = await supabaseAdmin.from("clients").select("ca_firm_id, business_name").eq("id", role.client_id).single();
    const firmId = client?.ca_firm_id;
    if (!firmId) throw new Error("Client firm not found");

    const { data: row, error } = await supabaseAdmin
      .from("client_conversations")
      .insert({
        ca_firm_id: firmId,
        client_id: role.client_id,
        channel: "IN_APP",
        direction: "INBOUND",
        body: data.body,
        sent_by: context.userId,
        parent_conversation_id: lastCa.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: staff } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("ca_firm_id", firmId)
      .in("role", ["ca_owner", "ca_staff"]);
    for (const s of staff ?? []) {
      await supabaseAdmin.from("ca_notifications").insert({
        ca_firm_id: firmId,
        user_id: s.user_id,
        type: "client_reply",
        title: `Reply from ${client?.business_name}`,
        body: data.body.slice(0, 160),
        link: `/ca/clients/${role.client_id}`,
      });
    }

    return { id: row!.id };
  });

export const markClientMessagesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("client_id")
      .eq("user_id", context.userId)
      .limit(1);
    const clientId = roles?.[0]?.client_id;
    if (!clientId) return { ok: true };

    const { data: unread } = await supabaseAdmin
      .from("client_conversations")
      .select("id")
      .eq("client_id", clientId)
      .eq("channel", "IN_APP")
      .eq("direction", "OUTBOUND");

    if (unread?.length) {
      await supabaseAdmin.from("client_conversation_reads").upsert(
        unread.map((u) => ({ conversation_id: u.id, user_id: context.userId })),
        { onConflict: "conversation_id,user_id" },
      );
    }
    return { ok: true };
  });

export const listCaNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ unreadOnly: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    let q = supabaseAdmin
      .from("ca_notifications")
      .select("*")
      .eq("ca_firm_id", firmId)
      .or(`user_id.is.null,user_id.eq.${context.userId}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.unreadOnly) q = q.is("read_at", null);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    let q = supabaseAdmin
      .from("ca_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("ca_firm_id", firmId)
      .or(`user_id.is.null,user_id.eq.${context.userId}`);
    if (data.id) q = q.eq("id", data.id);
    await q;
    return { ok: true };
  });

export const getDueTodayFollowUpCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await supabaseAdmin
      .from("call_logs")
      .select("id", { count: "exact", head: true })
      .eq("ca_firm_id", firmId)
      .eq("follow_up_required", true)
      .is("follow_up_completed_at", null)
      .eq("follow_up_date", today);
    return { count: count ?? 0 };
  });
