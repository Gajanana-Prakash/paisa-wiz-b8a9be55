import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess, isCAOwner, nextDueDate, nextPeriodLabel } from "./tasks.server";

const TaskTypeEnum = z.enum([
  "GST_FILING","TDS_RETURN","ITR_FILING","AUDIT","BOOKKEEPING","NOTICE_REPLY","DOCUMENT_COLLECTION","OTHER",
]);
const PriorityEnum = z.enum(["LOW","MEDIUM","HIGH","URGENT"]);
const StatusEnum = z.enum(["TODO","IN_PROGRESS","REVIEW","COMPLETED","CANCELLED"]);

const CreateInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  client_id: z.string().uuid().nullable().optional(),
  compliance_deadline_id: z.string().uuid().nullable().optional(),
  task_type: TaskTypeEnum.default("OTHER"),
  priority: PriorityEnum.default("MEDIUM"),
  assigned_to: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  estimated_hours: z.number().nullable().optional(),
  period_label: z.string().max(100).nullable().optional(),
  is_recurring: z.boolean().default(false),
  recurrence_rule: z.string().max(40).nullable().optional(),
});

const UpdatePatch = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  task_type: TaskTypeEnum.optional(),
  priority: PriorityEnum.optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  estimated_hours: z.number().nullable().optional(),
  status: StatusEnum.optional(),
  period_label: z.string().max(100).nullable().optional(),
  is_recurring: z.boolean().optional(),
  recurrence_rule: z.string().max(40).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  compliance_deadline_id: z.string().uuid().nullable().optional(),
});

export const listTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      scope: z.enum(["firm", "mine", "client"]).default("firm"),
      clientId: z.string().uuid().optional(),
      status: StatusEnum.optional(),
      priority: PriorityEnum.optional(),
      taskType: TaskTypeEnum.optional(),
      assignedTo: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      search: z.string().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);

    let q = supabaseAdmin
      .from("tasks")
      .select(`
        id, ca_firm_id, client_id, compliance_deadline_id, title, description,
        task_type, priority, assigned_to, created_by, due_date, estimated_hours,
        status, period_label, is_recurring, recurrence_rule, parent_task_id,
        completed_at, created_at, updated_at,
        clients(id, business_name)
      `)
      .eq("ca_firm_id", firmId)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (data.scope === "mine") q = q.eq("assigned_to", context.userId);
    if (data.scope === "client" && data.clientId) q = q.eq("client_id", data.clientId);
    if (data.clientId && data.scope !== "client") q = q.eq("client_id", data.clientId);
    if (data.status) q = q.eq("status", data.status);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.taskType) q = q.eq("task_type", data.taskType);
    if (data.assignedTo) q = q.eq("assigned_to", data.assignedTo);
    if (data.from) q = q.gte("due_date", data.from);
    if (data.to) q = q.lte("due_date", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let list = (rows ?? []) as any[];
    if (data.search?.trim()) {
      const s = data.search.trim().toLowerCase();
      list = list.filter((r) =>
        (r.title || "").toLowerCase().includes(s) ||
        (r.clients?.business_name || "").toLowerCase().includes(s),
      );
    }

    // Hide COMPLETED older than 30 days from the default firm view.
    if (data.scope === "firm" && !data.status) {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      list = list.filter((r) => r.status !== "COMPLETED" || (r.completed_at && r.completed_at >= cutoff));
    }

    // Attach comment counts in one round-trip
    const ids = list.map((r) => r.id);
    let counts = new Map<string, number>();
    if (ids.length) {
      const { data: cs } = await supabaseAdmin
        .from("task_comments")
        .select("task_id")
        .in("task_id", ids);
      for (const c of cs ?? []) counts.set(c.task_id, (counts.get(c.task_id) ?? 0) + 1);
    }
    return list.map((r) => ({ ...r, comment_count: counts.get(r.id) ?? 0 }));
  });

export const getTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: task, error } = await supabaseAdmin
      .from("tasks")
      .select(`*, clients(id, business_name)`)
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task) throw new Error("Task not found");

    const [{ data: subtasks }, { data: comments }, { data: attachments }] = await Promise.all([
      supabaseAdmin.from("task_subtasks").select("*").eq("task_id", data.id).order("sort_order").order("created_at"),
      supabaseAdmin.from("task_comments").select("*").eq("task_id", data.id).order("created_at", { ascending: true }),
      supabaseAdmin.from("task_attachments").select("*").eq("task_id", data.id).order("created_at", { ascending: false }),
    ]);

    // Resolve commenter names
    const userIds = Array.from(new Set([
      ...(comments ?? []).map((c) => c.user_id),
      ...(task.assigned_to ? [task.assigned_to] : []),
      task.created_by,
    ].filter(Boolean)));
    let profiles: Record<string, string> = {};
    if (userIds.length) {
      const { data: ps } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds as string[]);
      profiles = Object.fromEntries((ps ?? []).map((p: any) => [p.id, p.full_name as string]));
    }

    return { task, subtasks: subtasks ?? [], comments: comments ?? [], attachments: attachments ?? [], profiles };
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const insert = {
      ca_firm_id: firmId,
      created_by: context.userId,
      title: data.title,
      description: data.description ?? null,
      client_id: data.client_id ?? null,
      compliance_deadline_id: data.compliance_deadline_id ?? null,
      task_type: data.task_type,
      priority: data.priority,
      assigned_to: data.assigned_to ?? null,
      due_date: data.due_date ?? null,
      estimated_hours: data.estimated_hours ?? null,
      period_label: data.period_label ?? null,
      is_recurring: data.is_recurring ?? false,
      recurrence_rule: data.recurrence_rule ?? null,
      status: "TODO" as const,
    };
    const { data: row, error } = await supabaseAdmin.from("tasks").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), patch: UpdatePatch }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);

    const { data: existing } = await supabaseAdmin
      .from("tasks").select("*").eq("id", data.id).eq("ca_firm_id", firmId).maybeSingle();
    if (!existing) throw new Error("Task not found");

    const patch: any = { ...data.patch };
    if (data.patch.status === "COMPLETED" && existing.status !== "COMPLETED") {
      patch.completed_at = new Date().toISOString();
    } else if (data.patch.status && data.patch.status !== "COMPLETED") {
      patch.completed_at = null;
    }

    const { error } = await supabaseAdmin.from("tasks").update(patch).eq("id", data.id).eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);

    // Recurring: auto-spawn next occurrence when newly marked COMPLETED
    let nextId: string | null = null;
    if (data.patch.status === "COMPLETED" && existing.status !== "COMPLETED" && existing.is_recurring) {
      const baseDue = existing.due_date ?? new Date().toISOString().slice(0, 10);
      const nextDue = nextDueDate(baseDue, existing.recurrence_rule);
      const { data: spawned } = await supabaseAdmin.from("tasks").insert({
        ca_firm_id: firmId,
        created_by: context.userId,
        title: existing.title,
        description: existing.description,
        client_id: existing.client_id,
        compliance_deadline_id: null,
        task_type: existing.task_type,
        priority: existing.priority,
        assigned_to: existing.assigned_to,
        due_date: nextDue,
        estimated_hours: existing.estimated_hours,
        period_label: nextPeriodLabel(existing.period_label, existing.recurrence_rule),
        is_recurring: true,
        recurrence_rule: existing.recurrence_rule,
        parent_task_id: existing.parent_task_id ?? existing.id,
        status: "TODO",
      }).select("id").single();
      nextId = spawned?.id ?? null;

      // Log to activity_logs so CA Owner sees it
      if (existing.client_id) {
        await supabaseAdmin.from("activity_logs").insert({
          ca_firm_id: firmId,
          client_id: existing.client_id,
          actor_user_id: context.userId,
          action: "task_recurrence_created",
          entity_type: "task",
          entity_id: nextId,
          metadata: { from_task: existing.id, title: existing.title, due_date: nextDue },
        });
      }
    }

    return { ok: true, nextId };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA Owner can delete tasks");
    const { error } = await supabaseAdmin.from("tasks").delete().eq("id", data.id).eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* Comments */

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: z.string().uuid(), comment: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: t } = await supabaseAdmin.from("tasks").select("id").eq("id", data.taskId).eq("ca_firm_id", firmId).maybeSingle();
    if (!t) throw new Error("Task not found");
    const { error } = await supabaseAdmin.from("task_comments").insert({
      task_id: data.taskId, user_id: context.userId, comment: data.comment,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* Subtasks */

export const addSubtask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: z.string().uuid(), title: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: t } = await supabaseAdmin.from("tasks").select("id").eq("id", data.taskId).eq("ca_firm_id", firmId).maybeSingle();
    if (!t) throw new Error("Task not found");
    const { error } = await supabaseAdmin.from("task_subtasks").insert({
      task_id: data.taskId, title: data.title,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleSubtask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), is_done: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFirmAccess(context.userId);
    const { error } = await supabaseAdmin.from("task_subtasks").update({ is_done: data.is_done }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSubtask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFirmAccess(context.userId);
    const { error } = await supabaseAdmin.from("task_subtasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* Attachments — file upload happens client-side to storage; we just record metadata */

export const addAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      taskId: z.string().uuid(),
      file_url: z.string().min(1).max(1000),
      file_name: z.string().min(1).max(300),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: t } = await supabaseAdmin.from("tasks").select("id").eq("id", data.taskId).eq("ca_firm_id", firmId).maybeSingle();
    if (!t) throw new Error("Task not found");
    const { error } = await supabaseAdmin.from("task_attachments").insert({
      task_id: data.taskId, file_url: data.file_url, file_name: data.file_name, uploaded_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* Firm metadata */

export const listAssignableStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .eq("ca_firm_id", firmId)
      .in("role", ["ca_owner", "ca_staff"]);
    const ids = (data ?? []).map((r: any) => r.user_id as string);
    if (!ids.length) return [] as Array<{ id: string; name: string; role: string }>;
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, full_name").in("id", ids);
    const nameMap = new Map<string, string>((profs ?? []).map((p: any) => [p.id, p.full_name as string]));
    const roleMap = new Map<string, string>((data ?? []).map((r: any) => [r.user_id, r.role]));
    return ids.map((id) => ({ id, name: nameMap.get(id) || "Unnamed", role: roleMap.get(id) || "ca_staff" }));
  });

export const listFirmClientsLite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data } = await supabaseAdmin
      .from("clients").select("id, business_name").eq("ca_firm_id", firmId).order("business_name");
    return data ?? [];
  });

export const getEscalationCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const threeAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const { data } = await supabaseAdmin
      .from("tasks")
      .select("id, due_date, priority, status")
      .eq("ca_firm_id", firmId)
      .not("status", "in", "(COMPLETED,CANCELLED)")
      .lt("due_date", today);
    const arr = data ?? [];
    return {
      overdueHighUrgent: arr.filter((t) => t.priority === "HIGH" || t.priority === "URGENT").length,
      overdue3Plus: arr.filter((t) => t.due_date && t.due_date <= threeAgo).length,
      overdueTotal: arr.length,
    };
  });
