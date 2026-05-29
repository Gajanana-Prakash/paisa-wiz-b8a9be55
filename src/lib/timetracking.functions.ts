import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess, isCAOwner, getStaffBillingRate, computeBillableAmount, weekStart } from "./timetracking.server";

const LeaveTypeEnum = z.enum(["CASUAL", "SICK", "EARNED", "HALF_DAY", "COMP_OFF"]);
const LeaveStatusEnum = z.enum(["PENDING", "APPROVED", "REJECTED"]);

/* ========== TIMER / TIME LOGS ========== */

export const startTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid().nullable().optional(),
      taskId: z.string().uuid().nullable().optional(),
      description: z.string().max(1000).optional().nullable(),
      isBillable: z.boolean().default(true),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: running } = await supabaseAdmin
      .from("time_logs").select("id").eq("staff_user_id", context.userId).is("ended_at", null).maybeSingle();
    if (running) throw new Error("A timer is already running. Stop it first.");

    const rate = await getStaffBillingRate(context.userId, firmId);
    const { data: row, error } = await supabaseAdmin.from("time_logs").insert({
      ca_firm_id: firmId,
      staff_user_id: context.userId,
      client_id: data.clientId ?? null,
      task_id: data.taskId ?? null,
      description: data.description ?? null,
      started_at: new Date().toISOString(),
      is_billable: data.isBillable,
      billing_rate_per_hour: rate,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const stopTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    let q = supabaseAdmin.from("time_logs").select("*").eq("ca_firm_id", firmId).is("ended_at", null);
    if (data.id) q = q.eq("id", data.id);
    else q = q.eq("staff_user_id", context.userId);
    const { data: running } = await q.maybeSingle();
    if (!running) throw new Error("No running timer found");
    if (running.staff_user_id !== context.userId && !(await isCAOwner(context.userId, firmId))) {
      throw new Error("Only the timer owner or CA Owner can stop this timer");
    }
    const endedAt = new Date();
    const startedAt = new Date(running.started_at as string);
    const minutes = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
    const amount = computeBillableAmount(minutes, Number(running.billing_rate_per_hour ?? 0), !!running.is_billable);
    const { error } = await supabaseAdmin.from("time_logs").update({
      ended_at: endedAt.toISOString(),
      duration_minutes: minutes,
      billable_amount: amount,
    }).eq("id", running.id);
    if (error) throw new Error(error.message);
    return { ok: true, durationMinutes: minutes, billableAmount: amount };
  });

export const getMyRunningTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFirmAccess(context.userId);
    const { data } = await supabaseAdmin
      .from("time_logs")
      .select("id, started_at, description, is_billable, client_id, task_id, clients(business_name), tasks(title)")
      .eq("staff_user_id", context.userId)
      .is("ended_at", null)
      .maybeSingle();
    return data ?? null;
  });

export const listActiveTimers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data } = await supabaseAdmin
      .from("time_logs")
      .select("id, started_at, description, staff_user_id, client_id, task_id, clients(business_name), tasks(title)")
      .eq("ca_firm_id", firmId).is("ended_at", null).order("started_at", { ascending: true });
    const rows = data ?? [];
    const ids = Array.from(new Set(rows.map((r: any) => r.staff_user_id)));
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
      nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name as string]));
    }
    return rows.map((r: any) => ({ ...r, staff_name: nameMap.get(r.staff_user_id) || "Unknown" }));
  });

export const listTimeLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      scope: z.enum(["firm", "mine"]).default("firm"),
      staffId: z.string().uuid().optional(),
      clientId: z.string().uuid().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      billableOnly: z.boolean().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    let q = supabaseAdmin
      .from("time_logs")
      .select(`id, staff_user_id, client_id, task_id, description, started_at, ended_at,
               duration_minutes, is_billable, billing_rate_per_hour, billable_amount,
               clients(business_name), tasks(title)`)
      .eq("ca_firm_id", firmId)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false });

    if (data.scope === "mine") q = q.eq("staff_user_id", context.userId);
    if (data.staffId) q = q.eq("staff_user_id", data.staffId);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.dateFrom) q = q.gte("started_at", data.dateFrom);
    if (data.dateTo) q = q.lte("started_at", data.dateTo);
    if (data.billableOnly) q = q.eq("is_billable", true);

    const { data: rows, error } = await q.limit(1000);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.staff_user_id)));
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
      nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name as string]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, staff_name: nameMap.get(r.staff_user_id) || "Unknown" }));
  });

export const createTimeLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid().nullable().optional(),
      taskId: z.string().uuid().nullable().optional(),
      description: z.string().max(1000).optional().nullable(),
      startedAt: z.string(),
      endedAt: z.string(),
      isBillable: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const started = new Date(data.startedAt);
    const ended = new Date(data.endedAt);
    if (!(ended > started)) throw new Error("End time must be after start time");
    const minutes = Math.round((ended.getTime() - started.getTime()) / 60000);
    const rate = await getStaffBillingRate(context.userId, firmId);
    const amount = computeBillableAmount(minutes, rate, data.isBillable);
    const { error } = await supabaseAdmin.from("time_logs").insert({
      ca_firm_id: firmId,
      staff_user_id: context.userId,
      client_id: data.clientId ?? null,
      task_id: data.taskId ?? null,
      description: data.description ?? null,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      duration_minutes: minutes,
      is_billable: data.isBillable,
      billing_rate_per_hour: rate,
      billable_amount: amount,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTimeLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({
        description: z.string().max(1000).nullable().optional(),
        is_billable: z.boolean().optional(),
        duration_minutes: z.number().int().min(0).max(24 * 60 * 7).optional(),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: existing } = await supabaseAdmin
      .from("time_logs").select("*").eq("id", data.id).eq("ca_firm_id", firmId).maybeSingle();
    if (!existing) throw new Error("Time log not found");
    const owner = await isCAOwner(context.userId, firmId);
    if (existing.staff_user_id !== context.userId && !owner) throw new Error("Not allowed");

    const patch: any = { ...data.patch };
    const minutes = data.patch.duration_minutes ?? existing.duration_minutes ?? 0;
    const billable = data.patch.is_billable ?? existing.is_billable;
    patch.billable_amount = computeBillableAmount(minutes, Number(existing.billing_rate_per_hour ?? 0), !!billable);
    const { error } = await supabaseAdmin.from("time_logs").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTimeLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA Owner can delete logs");
    const { error } = await supabaseAdmin.from("time_logs").delete().eq("id", data.id).eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ========== STAFF ========== */

export const listStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id, role").eq("ca_firm_id", firmId).in("role", ["ca_owner", "ca_staff"]);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return [];
    const [{ data: profiles }, { data: staffProfiles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name").in("id", ids),
      supabaseAdmin.from("staff_profiles").select("*").eq("ca_firm_id", firmId).in("user_id", ids),
    ]);
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name as string]));
    const spMap = new Map((staffProfiles ?? []).map((s: any) => [s.user_id, s]));
    const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));

    // Week hours per staff
    const ws = weekStart(new Date()).toISOString();
    const { data: weekLogs } = await supabaseAdmin
      .from("time_logs")
      .select("staff_user_id, duration_minutes, is_billable")
      .eq("ca_firm_id", firmId)
      .gte("started_at", ws)
      .not("ended_at", "is", null);
    const weekMap = new Map<string, { total: number; billable: number }>();
    for (const l of weekLogs ?? []) {
      const cur = weekMap.get(l.staff_user_id as string) ?? { total: 0, billable: 0 };
      cur.total += l.duration_minutes ?? 0;
      if (l.is_billable) cur.billable += l.duration_minutes ?? 0;
      weekMap.set(l.staff_user_id as string, cur);
    }

    // Pending leaves
    const { data: leaves } = await supabaseAdmin
      .from("leave_records").select("staff_user_id").eq("ca_firm_id", firmId).eq("status", "PENDING");
    const leaveCount = new Map<string, number>();
    for (const l of leaves ?? []) leaveCount.set(l.staff_user_id, (leaveCount.get(l.staff_user_id) ?? 0) + 1);

    return ids.map((id) => {
      const sp: any = spMap.get(id) ?? null;
      const w = weekMap.get(id) ?? { total: 0, billable: 0 };
      return {
        user_id: id,
        name: profMap.get(id) || "Unnamed",
        role: roleMap.get(id) || "ca_staff",
        profile: sp,
        designation: sp?.designation ?? null,
        billing_rate_per_hour: Number(sp?.billing_rate_per_hour ?? 0),
        cost_rate_per_hour: Number(sp?.cost_rate_per_hour ?? 0),
        weekly_target_hours: sp?.weekly_target_hours ?? 40,
        leave_balance: sp?.leave_balance ?? 0,
        joining_date: sp?.joining_date ?? null,
        is_active: sp?.is_active ?? true,
        week_minutes: w.total,
        week_billable_minutes: w.billable,
        pending_leaves: leaveCount.get(id) ?? 0,
      };
    });
  });

export const getStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const [{ data: role }, { data: profile }, { data: sp }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("ca_firm_id", firmId).eq("user_id", data.userId).maybeSingle(),
      supabaseAdmin.from("profiles").select("id, full_name").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.from("staff_profiles").select("*").eq("ca_firm_id", firmId).eq("user_id", data.userId).maybeSingle(),
    ]);
    if (!role) throw new Error("Staff member not found in this firm");

    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const [{ data: monthLogs }, { data: leaves }, { data: tasksDone }, { data: tasksOverdue }] = await Promise.all([
      supabaseAdmin.from("time_logs").select("duration_minutes, is_billable, billable_amount")
        .eq("ca_firm_id", firmId).eq("staff_user_id", data.userId).gte("started_at", monthStart.toISOString())
        .not("ended_at", "is", null),
      supabaseAdmin.from("leave_records").select("*").eq("ca_firm_id", firmId).eq("staff_user_id", data.userId).order("leave_date", { ascending: false }).limit(50),
      supabaseAdmin.from("tasks").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).eq("assigned_to", data.userId).eq("status", "COMPLETED"),
      supabaseAdmin.from("tasks").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).eq("assigned_to", data.userId).not("status", "in", "(COMPLETED,CANCELLED)").lt("due_date", new Date().toISOString().slice(0, 10)),
    ]);
    const minutes = (monthLogs ?? []).reduce((s: number, l: any) => s + (l.duration_minutes ?? 0), 0);
    const billableMinutes = (monthLogs ?? []).filter((l: any) => l.is_billable).reduce((s: number, l: any) => s + (l.duration_minutes ?? 0), 0);
    const billableAmount = (monthLogs ?? []).reduce((s: number, l: any) => s + Number(l.billable_amount ?? 0), 0);

    return {
      user_id: data.userId,
      name: profile?.full_name || "Unnamed",
      role: role.role,
      profile: sp,
      stats: {
        month_minutes: minutes,
        month_billable_minutes: billableMinutes,
        month_billable_amount: Math.round(billableAmount * 100) / 100,
        tasks_completed: tasksDone?.length ?? (tasksDone as any)?.count ?? 0,
        tasks_overdue: tasksOverdue?.length ?? (tasksOverdue as any)?.count ?? 0,
      },
      leaves: leaves ?? [],
    };
  });

export const addStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      email: z.string().trim().email().max(255),
      designation: z.string().trim().max(120).optional().nullable(),
      billingRate: z.number().min(0).max(1_000_000).default(0),
      costRate: z.number().min(0).max(1_000_000).default(0),
      weeklyTargetHours: z.number().int().min(0).max(168).default(40),
      joiningDate: z.string().optional().nullable(),
      clientIds: z.array(z.string().uuid()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA Owner can add staff");

    // Lookup existing auth user
    let userId: string | null = null;
    let page = 1;
    const target = data.email.toLowerCase();
    while (page < 20) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const found = list.users.find((u) => (u.email ?? "").toLowerCase() === target);
      if (found) { userId = found.id; break; }
      if (list.users.length < 200) break;
      page += 1;
    }
    if (!userId) {
      // Invite via auth admin
      const { data: invited, error: iErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
      if (iErr || !invited.user) throw new Error(iErr?.message || "Could not invite user");
      userId = invited.user.id;
    }

    // Insert role (idempotent)
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role: "ca_staff", ca_firm_id: firmId },
      { onConflict: "user_id,role,ca_firm_id" as any, ignoreDuplicates: true },
    );

    // Upsert staff_profile
    const { error: spErr } = await supabaseAdmin.from("staff_profiles").upsert({
      ca_firm_id: firmId,
      user_id: userId,
      designation: data.designation ?? null,
      billing_rate_per_hour: data.billingRate,
      cost_rate_per_hour: data.costRate,
      weekly_target_hours: data.weeklyTargetHours,
      joining_date: data.joiningDate ?? null,
    }, { onConflict: "ca_firm_id,user_id" });
    if (spErr) throw new Error(spErr.message);

    // Client assignments
    if (data.clientIds?.length) {
      const rows = data.clientIds.map((cid) => ({
        ca_firm_id: firmId,
        client_id: cid,
        staff_user_id: userId!,
        assigned_by: context.userId,
      }));
      await supabaseAdmin.from("ca_staff_assignments").insert(rows);
    }
    return { ok: true, userId };
  });

export const updateStaffProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      patch: z.object({
        designation: z.string().max(120).nullable().optional(),
        billing_rate_per_hour: z.number().min(0).max(1_000_000).optional(),
        cost_rate_per_hour: z.number().min(0).max(1_000_000).optional(),
        weekly_target_hours: z.number().int().min(0).max(168).optional(),
        leave_balance: z.number().int().min(0).max(365).optional(),
        joining_date: z.string().nullable().optional(),
        is_active: z.boolean().optional(),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA Owner can edit staff");
    const { error } = await supabaseAdmin.from("staff_profiles")
      .update(data.patch).eq("ca_firm_id", firmId).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ========== LEAVE ========== */

export const requestLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      leaveDate: z.string(),
      leaveType: LeaveTypeEnum,
      reason: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { error } = await supabaseAdmin.from("leave_records").insert({
      ca_firm_id: firmId,
      staff_user_id: context.userId,
      leave_date: data.leaveDate,
      leave_type: data.leaveType,
      reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const decideLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), status: LeaveStatusEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA Owner can decide leave");
    const { data: existing } = await supabaseAdmin
      .from("leave_records").select("*").eq("id", data.id).eq("ca_firm_id", firmId).maybeSingle();
    if (!existing) throw new Error("Leave request not found");
    const { error } = await supabaseAdmin.from("leave_records")
      .update({ status: data.status, approved_by: context.userId }).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.status === "APPROVED" && existing.status !== "APPROVED") {
      const { data: sp } = await supabaseAdmin.from("staff_profiles")
        .select("leave_balance").eq("ca_firm_id", firmId).eq("user_id", existing.staff_user_id).maybeSingle();
      const balance = Math.max(0, (sp?.leave_balance ?? 0) - (existing.leave_type === "HALF_DAY" ? 1 : 1));
      await supabaseAdmin.from("staff_profiles")
        .update({ leave_balance: balance }).eq("ca_firm_id", firmId).eq("user_id", existing.staff_user_id);
    }
    return { ok: true };
  });

export const listLeaveRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scope: z.enum(["firm", "mine"]).default("firm") }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    let q = supabaseAdmin.from("leave_records").select("*").eq("ca_firm_id", firmId)
      .order("leave_date", { ascending: false });
    if (data.scope === "mine") q = q.eq("staff_user_id", context.userId);
    const { data: rows } = await q.limit(200);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.staff_user_id)));
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
      nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name as string]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, staff_name: nameMap.get(r.staff_user_id) || "Unknown" }));
  });

/* ========== REPORTS ========== */

export const clientProfitabilityReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ dateFrom: z.string(), dateTo: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: logs } = await supabaseAdmin
      .from("time_logs")
      .select("client_id, duration_minutes, is_billable, billable_amount, clients(business_name)")
      .eq("ca_firm_id", firmId)
      .gte("started_at", data.dateFrom).lte("started_at", data.dateTo)
      .not("ended_at", "is", null);
    const map = new Map<string, { client_id: string; client_name: string; minutes: number; billable_minutes: number; billable_amount: number }>();
    for (const l of logs ?? []) {
      const cid = l.client_id ?? "INTERNAL";
      const name = (l as any).clients?.business_name ?? (cid === "INTERNAL" ? "Internal (no client)" : "Unknown");
      const cur = map.get(cid) ?? { client_id: cid, client_name: name, minutes: 0, billable_minutes: 0, billable_amount: 0 };
      cur.minutes += l.duration_minutes ?? 0;
      if (l.is_billable) cur.billable_minutes += l.duration_minutes ?? 0;
      cur.billable_amount += Number(l.billable_amount ?? 0);
      map.set(cid, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.billable_amount - a.billable_amount);
  });

export const staffUtilizationReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ dateFrom: z.string(), dateTo: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: logs } = await supabaseAdmin
      .from("time_logs")
      .select("staff_user_id, duration_minutes, is_billable, billable_amount")
      .eq("ca_firm_id", firmId)
      .gte("started_at", data.dateFrom).lte("started_at", data.dateTo)
      .not("ended_at", "is", null);
    const { data: sp } = await supabaseAdmin
      .from("staff_profiles").select("user_id, weekly_target_hours").eq("ca_firm_id", firmId);
    const targets = new Map((sp ?? []).map((s: any) => [s.user_id, s.weekly_target_hours]));

    const map = new Map<string, { staff_user_id: string; minutes: number; billable_minutes: number; billable_amount: number }>();
    for (const l of logs ?? []) {
      const id = l.staff_user_id as string;
      const cur = map.get(id) ?? { staff_user_id: id, minutes: 0, billable_minutes: 0, billable_amount: 0 };
      cur.minutes += l.duration_minutes ?? 0;
      if (l.is_billable) cur.billable_minutes += l.duration_minutes ?? 0;
      cur.billable_amount += Number(l.billable_amount ?? 0);
      map.set(id, cur);
    }
    const ids = Array.from(map.keys());
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
      nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name as string]));
    }
    const from = new Date(data.dateFrom);
    const to = new Date(data.dateTo);
    const weeks = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (7 * 86400000)));
    return Array.from(map.values()).map((r) => {
      const target = (targets.get(r.staff_user_id) ?? 40) * weeks * 60;
      const utilization = target > 0 ? (r.billable_minutes / target) * 100 : 0;
      return {
        ...r,
        staff_name: nameMap.get(r.staff_user_id) || "Unknown",
        target_minutes: target,
        utilization_pct: Math.round(utilization * 10) / 10,
      };
    }).sort((a, b) => b.billable_amount - a.billable_amount);
  });

export const monthlyBillingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ year: z.number().int().min(2000).max(2100) }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const from = new Date(Date.UTC(data.year, 0, 1)).toISOString();
    const to = new Date(Date.UTC(data.year + 1, 0, 1)).toISOString();
    const { data: logs } = await supabaseAdmin
      .from("time_logs").select("started_at, duration_minutes, is_billable, billable_amount")
      .eq("ca_firm_id", firmId).gte("started_at", from).lt("started_at", to).not("ended_at", "is", null);
    const months: Array<{ month: number; minutes: number; billable_minutes: number; billable_amount: number }> = [];
    for (let m = 0; m < 12; m += 1) months.push({ month: m + 1, minutes: 0, billable_minutes: 0, billable_amount: 0 });
    for (const l of logs ?? []) {
      const mIdx = new Date(l.started_at as string).getUTCMonth();
      months[mIdx].minutes += l.duration_minutes ?? 0;
      if (l.is_billable) months[mIdx].billable_minutes += l.duration_minutes ?? 0;
      months[mIdx].billable_amount += Number(l.billable_amount ?? 0);
    }
    return months;
  });
