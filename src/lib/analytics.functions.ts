import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess, isCAOwner } from "./timetracking.server";
import {
  daysBetween,
  lastNMonths,
  pctChange,
  resolveDateRange,
  round2,
  type DateRangePreset,
} from "./analytics.server";

const Preset = z.enum([
  "THIS_MONTH", "LAST_MONTH", "THIS_QUARTER", "LAST_QUARTER", "THIS_FY", "CUSTOM",
]);

const STAFF_HOUR_TARGET = 160;

async function profileNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, (p.full_name as string) || "Unknown"]));
}

export const getFirmAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      preset: Preset,
      customFrom: z.string().optional(),
      customTo: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) {
      throw new Error("Firm analytics are available to CA owners only");
    }

    const range = resolveDateRange(
      data.preset as DateRangePreset,
      data.customFrom,
      data.customTo,
    );
    const today = new Date().toISOString().slice(0, 10);

    const [
      invoicesRes,
      prevInvoicesRes,
      timeLogsRes,
      tasksRes,
      deadlinesRes,
      clientsRes,
      staffRes,
      rolesRes,
      queryRatingsRes,
    ] = await Promise.all([
      supabaseAdmin.from("ca_invoices")
        .select("id, client_id, invoice_number, invoice_date, due_date, total_amount, amount_paid, balance_due, status, clients(business_name)")
        .eq("ca_firm_id", firmId)
        .neq("status", "CANCELLED"),
      supabaseAdmin.from("ca_invoices")
        .select("total_amount, amount_paid, status, invoice_date")
        .eq("ca_firm_id", firmId)
        .neq("status", "CANCELLED")
        .gte("invoice_date", range.prevFrom)
        .lte("invoice_date", range.prevTo),
      supabaseAdmin.from("time_logs")
        .select("staff_user_id, client_id, duration_minutes, is_billable, billable_amount, billing_rate_per_hour, started_at, clients(business_name)")
        .eq("ca_firm_id", firmId)
        .not("ended_at", "is", null),
      supabaseAdmin.from("tasks")
        .select("id, client_id, assigned_to, status, due_date, completed_at, task_type")
        .eq("ca_firm_id", firmId),
      supabaseAdmin.from("compliance_deadlines")
        .select("id, client_id, due_date, status, completed_at, compliance_types(category, name)")
        .eq("ca_firm_id", firmId),
      supabaseAdmin.from("clients")
        .select("id, business_name, status, created_at")
        .eq("ca_firm_id", firmId),
      supabaseAdmin.from("staff_profiles")
        .select("user_id, designation, billing_rate_per_hour, weekly_target_hours, is_active")
        .eq("ca_firm_id", firmId)
        .eq("is_active", true),
      supabaseAdmin.from("user_roles")
        .select("user_id, role")
        .eq("ca_firm_id", firmId)
        .eq("role", "ca_staff"),
      supabaseAdmin.from("client_queries")
        .select("client_rating")
        .eq("ca_firm_id", firmId)
        .not("client_rating", "is", null),
    ]);

    const allInvoices = invoicesRes.data ?? [];
    const periodInvoices = allInvoices.filter(
      (i) => i.invoice_date >= range.from && i.invoice_date <= range.to,
    );
    const prevPeriodInvoices = prevInvoicesRes.data ?? [];

    const isRevenueInvoice = (s: string) =>
      ["PAID", "PARTIALLY_PAID", "SENT", "OVERDUE"].includes(s);

    const totalRevenue = periodInvoices
      .filter((i) => isRevenueInvoice(i.status as string))
      .reduce((s, i) => s + Number(i.total_amount), 0);

    const revenueCollected = periodInvoices.reduce((s, i) => s + Number(i.amount_paid), 0);

    const outstandingDues = allInvoices
      .filter((i) => !["DRAFT", "CANCELLED", "PAID"].includes(i.status as string))
      .reduce((s, i) => s + Number(i.balance_due), 0);

    const prevRevenue = prevPeriodInvoices
      .filter((i) => isRevenueInvoice(i.status as string))
      .reduce((s, i) => s + Number(i.total_amount), 0);

    const revenueChangePct = pctChange(totalRevenue, prevRevenue);

    // Monthly revenue (12 months ending at range.to)
    const months12 = lastNMonths(range.to, 12);
    const monthlyRevenue = months12.map((m) => {
      const invs = allInvoices.filter(
        (i) => i.invoice_date >= m.from && i.invoice_date <= m.to,
      );
      return {
        month: m.label,
        invoiced: round2(invs.reduce((s, i) => s + Number(i.total_amount), 0)),
        collected: round2(invs.reduce((s, i) => s + Number(i.amount_paid), 0)),
      };
    });

    // Time logs in period
    const periodLogs = (timeLogsRes.data ?? []).filter(
      (l) => (l.started_at as string).slice(0, 10) >= range.from &&
        (l.started_at as string).slice(0, 10) <= range.to,
    );

    // Client profitability
    const clientInvMap = new Map<string, {
      clientId: string;
      clientName: string;
      invoiced: number;
      paid: number;
      outstanding: number;
      hours: number;
      services: Set<string>;
    }>();

    for (const inv of allInvoices) {
      const cid = inv.client_id as string;
      const name = (inv as { clients?: { business_name?: string } }).clients?.business_name ?? "Unknown";
      const cur = clientInvMap.get(cid) ?? {
        clientId: cid, clientName: name, invoiced: 0, paid: 0, outstanding: 0, hours: 0, services: new Set<string>(),
      };
      if (inv.invoice_date >= range.from && inv.invoice_date <= range.to) {
        cur.invoiced += Number(inv.total_amount);
        cur.paid += Number(inv.amount_paid);
      }
      if (!["DRAFT", "CANCELLED", "PAID"].includes(inv.status as string)) {
        cur.outstanding += Number(inv.balance_due);
      }
      clientInvMap.set(cid, cur);
    }

    for (const log of periodLogs) {
      if (!log.client_id) continue;
      const cid = log.client_id as string;
      const cur = clientInvMap.get(cid);
      if (cur) cur.hours += (log.duration_minutes ?? 0) / 60;
    }

    const completedTasks = (tasksRes.data ?? []).filter(
      (t) => t.status === "COMPLETED" &&
        t.completed_at &&
        (t.completed_at as string).slice(0, 10) >= range.from &&
        (t.completed_at as string).slice(0, 10) <= range.to,
    );
    for (const t of completedTasks) {
      if (!t.client_id) continue;
      const cur = clientInvMap.get(t.client_id);
      if (cur) cur.services.add(t.task_type as string);
    }

    let clientProfitability = Array.from(clientInvMap.values()).map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      totalInvoiced: round2(c.invoiced),
      totalPaid: round2(c.paid),
      outstanding: round2(c.outstanding),
      hoursSpent: round2(c.hours),
      revenuePerHour: c.hours > 0 ? round2(c.invoiced / c.hours) : 0,
      servicesUsed: Array.from(c.services),
    })).filter((c) => c.totalInvoiced > 0 || c.hoursSpent > 0);

    const avgRevPerHour = clientProfitability.length
      ? round2(
          clientProfitability.reduce((s, c) => s + c.revenuePerHour, 0) / clientProfitability.length,
        )
      : 0;

    clientProfitability.sort((a, b) => b.totalInvoiced - a.totalInvoiced);

    const top10Rev = clientProfitability.slice(0, 10);
    const othersRev = clientProfitability.slice(10).reduce((s, c) => s + c.totalInvoiced, 0);
    const clientRevenuePie = [
      ...top10Rev.map((c) => ({ name: c.clientName, value: c.totalInvoiced })),
      ...(othersRev > 0 ? [{ name: "Others", value: round2(othersRev) }] : []),
    ];

    // Staff performance
    const staffIds = new Set([
      ...(staffRes.data ?? []).map((s) => s.user_id),
      ...(rolesRes.data ?? []).map((r) => r.user_id),
    ]);
    const staffProfileMap = new Map((staffRes.data ?? []).map((s) => [s.user_id, s]));
    const names = await profileNames(Array.from(staffIds));

    const staffMap = new Map<string, {
      userId: string;
      name: string;
      designation: string;
      hours: number;
      billableHours: number;
      tasksCompleted: number;
      tasksOverdue: number;
      revenueGenerated: number;
    }>();

    for (const id of staffIds) {
      const sp = staffProfileMap.get(id);
      staffMap.set(id, {
        userId: id,
        name: names.get(id) ?? "Unknown",
        designation: sp?.designation ?? "Staff",
        hours: 0,
        billableHours: 0,
        tasksCompleted: 0,
        tasksOverdue: 0,
        revenueGenerated: 0,
      });
    }

    for (const log of periodLogs) {
      const id = log.staff_user_id as string;
      const cur = staffMap.get(id);
      if (!cur) continue;
      const hrs = (log.duration_minutes ?? 0) / 60;
      cur.hours += hrs;
      if (log.is_billable) {
        cur.billableHours += hrs;
        cur.revenueGenerated += Number(log.billable_amount ?? 0);
      }
    }

    for (const t of tasksRes.data ?? []) {
      if (!t.assigned_to) continue;
      const cur = staffMap.get(t.assigned_to);
      if (!cur) continue;
      if (
        t.status === "COMPLETED" &&
        t.completed_at &&
        (t.completed_at as string).slice(0, 10) >= range.from &&
        (t.completed_at as string).slice(0, 10) <= range.to
      ) {
        cur.tasksCompleted += 1;
      }
      if (
        t.status !== "COMPLETED" &&
        t.status !== "CANCELLED" &&
        t.due_date &&
        t.due_date < today
      ) {
        cur.tasksOverdue += 1;
      }
    }

    const staffPerformance = Array.from(staffMap.values()).map((s) => ({
      ...s,
      hours: round2(s.hours),
      billableHours: round2(s.billableHours),
      billablePct: s.hours > 0 ? round2((s.billableHours / s.hours) * 100) : 0,
      revenueGenerated: round2(s.revenueGenerated),
    })).sort((a, b) => b.hours - a.hours);

    const totalTeamHours = round2(staffPerformance.reduce((s, x) => s + x.hours, 0));
    const totalBillableHours = round2(staffPerformance.reduce((s, x) => s + x.billableHours, 0));
    const billablePct = totalTeamHours > 0 ? round2((totalBillableHours / totalTeamHours) * 100) : 0;
    const avgTasksPerStaff = staffPerformance.length
      ? round2(staffPerformance.reduce((s, x) => s + x.tasksCompleted, 0) / staffPerformance.length)
      : 0;
    const overdueTasksTotal = staffPerformance.reduce((s, x) => s + x.tasksOverdue, 0);

    const staffWorkload = staffPerformance.map((s) => ({
      name: s.name.split(" ")[0],
      hours: s.hours,
      target: STAFF_HOUR_TARGET,
    }));

    // Compliance
    const catMap: Record<string, { completed: number; onTime: number; late: number; pending: number; daysSum: number; daysCount: number }> = {
      GST: { completed: 0, onTime: 0, late: 0, pending: 0, daysSum: 0, daysCount: 0 },
      TDS: { completed: 0, onTime: 0, late: 0, pending: 0, daysSum: 0, daysCount: 0 },
      ITR: { completed: 0, onTime: 0, late: 0, pending: 0, daysSum: 0, daysCount: 0 },
      ROC: { completed: 0, onTime: 0, late: 0, pending: 0, daysSum: 0, daysCount: 0 },
    };

    const mapCategory = (raw: string) => {
      if (raw === "ROC_MCA") return "ROC";
      if (raw in catMap) return raw;
      return "GST";
    };

    let filingsCompleted = 0;
    let filingsOnTime = 0;
    let filingsLate = 0;
    let filingsPending = 0;
    let daysEarlyLateSum = 0;
    let daysEarlyLateCount = 0;

    for (const d of deadlinesRes.data ?? []) {
      const catRaw = (d as { compliance_types?: { category?: string } }).compliance_types?.category ?? "GST";
      const cat = mapCategory(catRaw);
      const bucket = catMap[cat];
      if (!bucket) continue;

      const inPeriod = d.due_date >= range.from && d.due_date <= range.to;
      if (!inPeriod && d.status !== "OVERDUE") continue;

      if (d.status === "COMPLETED") {
        bucket.completed += 1;
        filingsCompleted += 1;
        const completedDate = d.completed_at ? (d.completed_at as string).slice(0, 10) : d.due_date;
        const diff = daysBetween(d.due_date, completedDate);
        bucket.daysSum += diff;
        bucket.daysCount += 1;
        daysEarlyLateSum += diff;
        daysEarlyLateCount += 1;
        if (completedDate <= d.due_date) {
          bucket.onTime += 1;
          filingsOnTime += 1;
        } else {
          bucket.late += 1;
          filingsLate += 1;
        }
      } else if (["PENDING", "IN_PROGRESS", "OVERDUE"].includes(d.status as string)) {
        bucket.pending += 1;
        filingsPending += 1;
      }
    }

    const complianceByCategory = Object.entries(catMap).map(([category, v]) => ({
      category,
      completed: v.completed,
      onTime: v.onTime,
      late: v.late,
      pending: v.pending,
      onTimeRate: v.completed > 0 ? round2((v.onTime / v.completed) * 100) : 0,
    }));

    const filingsTotal = filingsCompleted + filingsPending + filingsLate;
    const onTimePct = filingsCompleted > 0 ? round2((filingsOnTime / filingsCompleted) * 100) : 0;
    const latePct = filingsCompleted > 0 ? round2((filingsLate / filingsCompleted) * 100) : 0;
    const avgDaysEarlyLate = daysEarlyLateCount > 0
      ? round2(daysEarlyLateSum / daysEarlyLateCount)
      : 0;

    // Client portfolio
    const allClients = clientsRes.data ?? [];
    const activeClients = allClients.filter((c) => c.status === "active").length;
    const clientsAdded = allClients.filter(
      (c) => (c.created_at as string).slice(0, 10) >= range.from &&
        (c.created_at as string).slice(0, 10) <= range.to,
    ).length;

    const staffCount = staffIds.size || 1;

    const clientIssues = new Map<string, {
      clientId: string;
      clientName: string;
      overdueFilings: number;
      openNotices: number;
      outstandingInvoice: number;
      overdueTasks: number;
      riskScore: number;
      health: "green" | "yellow" | "red";
    }>();

    for (const c of allClients) {
      clientIssues.set(c.id, {
        clientId: c.id,
        clientName: c.business_name,
        overdueFilings: 0,
        openNotices: 0,
        outstandingInvoice: 0,
        overdueTasks: 0,
        riskScore: 0,
        health: "green",
      });
    }

    for (const d of deadlinesRes.data ?? []) {
      if (d.status === "OVERDUE") {
        const cur = clientIssues.get(d.client_id);
        if (cur) cur.overdueFilings += 1;
      }
    }

    for (const t of tasksRes.data ?? []) {
      if (!t.client_id) continue;
      const cur = clientIssues.get(t.client_id);
      if (!cur) continue;
      if (t.task_type === "NOTICE_REPLY" && !["COMPLETED", "CANCELLED"].includes(t.status as string)) {
        cur.openNotices += 1;
      }
      if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.due_date && t.due_date < today) {
        cur.overdueTasks += 1;
      }
    }

    for (const inv of allInvoices) {
      if (!["DRAFT", "CANCELLED", "PAID"].includes(inv.status as string) && Number(inv.balance_due) > 0) {
        const cur = clientIssues.get(inv.client_id as string);
        if (cur) cur.outstandingInvoice += Number(inv.balance_due);
      }
    }

    const riskRadar = Array.from(clientIssues.values()).map((c) => {
      const riskScore =
        c.overdueFilings * 2 + c.openNotices * 2 + (c.outstandingInvoice > 0 ? 1 : 0) + c.overdueTasks;
      const health: "green" | "yellow" | "red" =
        riskScore === 0 ? "green" : riskScore <= 3 ? "yellow" : "red";
      return {
        ...c,
        outstandingInvoice: round2(c.outstandingInvoice),
        riskScore,
        health,
      };
    }).sort((a, b) => b.riskScore - a.riskScore);

    const healthDistribution = {
      green: riskRadar.filter((c) => c.health === "green").length,
      yellow: riskRadar.filter((c) => c.health === "yellow").length,
      red: riskRadar.filter((c) => c.health === "red").length,
    };

    const clientsWithOverdue = riskRadar.filter((c) => c.riskScore > 0).length;

    // Invoice aging
    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    const topOutstanding: Array<{
      clientName: string;
      invoiceNumber: string;
      invoiceDate: string;
      amount: number;
      daysOutstanding: number;
      invoiceId: string;
    }> = [];

    for (const inv of allInvoices) {
      const bal = Number(inv.balance_due);
      if (bal <= 0 || ["DRAFT", "CANCELLED", "PAID"].includes(inv.status as string)) continue;
      const days = Math.max(0, daysBetween(inv.due_date as string, today));
      if (inv.due_date > today) aging.current += bal;
      else if (days <= 30) aging.d1_30 += bal;
      else if (days <= 60) aging.d31_60 += bal;
      else if (days <= 90) aging.d61_90 += bal;
      else aging.d90_plus += bal;

      topOutstanding.push({
        invoiceId: inv.id as string,
        clientName: (inv as { clients?: { business_name?: string } }).clients?.business_name ?? "Unknown",
        invoiceNumber: inv.invoice_number as string,
        invoiceDate: inv.invoice_date as string,
        amount: round2(bal),
        daysOutstanding: inv.due_date > today ? 0 : days,
      });
    }
    topOutstanding.sort((a, b) => b.daysOutstanding - a.daysOutstanding);

    const invoiceAging = [
      { bucket: "Current", amount: round2(aging.current), fill: "#10b981" },
      { bucket: "1–30 days", amount: round2(aging.d1_30), fill: "#84cc16" },
      { bucket: "31–60 days", amount: round2(aging.d31_60), fill: "#f59e0b" },
      { bucket: "61–90 days", amount: round2(aging.d61_90), fill: "#f97316" },
      { bucket: "90+ days", amount: round2(aging.d90_plus), fill: "#ef4444" },
    ];

    // Growth (24 months)
    const months24 = lastNMonths(range.to, 24);
    let cumulative = allClients.filter(
      (c) => (c.created_at as string).slice(0, 10) <= months24[0]?.from,
    ).length;

    const clientAcquisition = months24.map((m) => {
      const added = allClients.filter(
        (c) => (c.created_at as string).slice(0, 10) >= m.from &&
          (c.created_at as string).slice(0, 10) <= m.to,
      ).length;
      cumulative += added;
      return { month: m.label, newClients: added, cumulative };
    });

    const revenueGrowth24 = months24.map((m) => {
      const invs = allInvoices.filter(
        (i) => i.invoice_date >= m.from && i.invoice_date <= m.to,
      );
      return {
        month: m.label,
        revenue: round2(
          invs.filter((i) => isRevenueInvoice(i.status as string))
            .reduce((s, i) => s + Number(i.total_amount), 0),
        ),
      };
    });

    const lastMonthRev = revenueGrowth24[revenueGrowth24.length - 1]?.revenue ?? 0;
    const prevMonthRev = revenueGrowth24[revenueGrowth24.length - 2]?.revenue ?? 0;
    const momRevenueGrowth = pctChange(lastMonthRev, prevMonthRev);

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const oldClients = allClients.filter(
      (c) => new Date(c.created_at as string) <= twelveMonthsAgo,
    );
    const retainedClients = oldClients.filter((c) => {
      const hasInvoice = allInvoices.some(
        (i) => i.client_id === c.id &&
          (i.invoice_date as string) >= isoDate(twelveMonthsAgo),
      );
      const hasTime = (timeLogsRes.data ?? []).some(
        (l) => l.client_id === c.id &&
          (l.started_at as string).slice(0, 10) >= isoDate(twelveMonthsAgo),
      );
      return hasInvoice || hasTime;
    });
    const retentionRate = oldClients.length > 0
      ? round2((retainedClients.length / oldClients.length) * 100)
      : 100;

    const ratings = (queryRatingsRes.data ?? []).map((q) => Number(q.client_rating)).filter((n) => n >= 1);
    const avgClientQueryRating = ratings.length
      ? round2(ratings.reduce((s, n) => s + n, 0) / ratings.length)
      : null;

    return {
      range,
      revenue: {
        totalRevenue: round2(totalRevenue),
        revenueCollected: round2(revenueCollected),
        outstandingDues: round2(outstandingDues),
        revenueChangePct,
        monthlyRevenue,
      },
      clientProfitability: {
        rows: clientProfitability,
        avgRevPerHour,
        pie: clientRevenuePie,
      },
      staff: {
        kpis: {
          totalTeamHours,
          billablePct,
          avgTasksPerStaff,
          overdueTasksTotal,
        },
        rows: staffPerformance,
        workload: staffWorkload,
        hourTarget: STAFF_HOUR_TARGET,
      },
      compliance: {
        kpis: {
          onTimePct,
          latePct,
          pending: filingsPending,
          avgDaysEarlyLate,
        },
        byCategory: complianceByCategory,
      },
      portfolio: {
        kpis: {
          activeClients,
          clientsAdded,
          clientsWithOverdue,
          avgClientsPerStaff: round2(activeClients / staffCount),
        },
        healthDistribution,
        riskRadar: riskRadar.slice(0, 50),
        avgClientQueryRating,
        queryRatingsCount: ratings.length,
      },
      billing: {
        aging: invoiceAging,
        topOutstanding: topOutstanding.slice(0, 20),
      },
      growth: {
        clientAcquisition,
        revenueGrowth24,
        momRevenueGrowth,
        retentionRate,
      },
    };
  });

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
