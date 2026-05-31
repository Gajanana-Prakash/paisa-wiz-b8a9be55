import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getClientContext(userId: string) {
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("client_id, ca_firm_id, role")
    .eq("user_id", userId)
    .in("role", ["client_owner", "client_employee"])
    .limit(1)
    .maybeSingle();
  if (!role?.client_id) throw new Error("Not a client portal user");

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, business_name, contact_name, contact_email, contact_phone, gstin, ca_firm_id")
    .eq("id", role.client_id)
    .single();
  if (!client) throw new Error("Client not found");

  const { data: firm } = await supabaseAdmin
    .from("ca_firms")
    .select("id, name, logo_url, primary_color, phone")
    .eq("id", client.ca_firm_id)
    .single();

  const { data: billing } = await supabaseAdmin
    .from("ca_firm_billing_settings")
    .select("bank_name, bank_account, bank_ifsc, account_holder, upi_id")
    .eq("ca_firm_id", client.ca_firm_id)
    .maybeSingle();

  return { client, firm, billing, userId };
}

export { insertClientNotification, notifyClientPortal } from "./client-notifications.server";

async function notifyCaFirm(
  firmId: string,
  opts: { title: string; body?: string; link?: string; userId?: string | null },
) {
  await supabaseAdmin.from("ca_notifications").insert({
    ca_firm_id: firmId,
    user_id: opts.userId ?? null,
    type: "client_portal",
    title: opts.title,
    body: opts.body ?? null,
    link: opts.link ?? null,
  });
}

function formatPlainDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export const getClientPortalHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { client, firm } = await getClientContext(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + "-01";

    const [deadlinesRes, docReqRes, invoicesRes, agreementsRes, dscRes] = await Promise.all([
      supabaseAdmin.from("compliance_deadlines")
        .select("id, due_date, status, period_label, completed_at, compliance_types(name, category)")
        .eq("client_id", client.id)
        .order("due_date", { ascending: true }),
      supabaseAdmin.from("document_requests")
        .select("id, doc_type, period_label, due_date, status")
        .eq("client_id", client.id)
        .in("status", ["pending", "partial"]),
      supabaseAdmin.from("ca_invoices")
        .select("id, invoice_number, total_amount, balance_due, due_date, status, sent_at, period_label")
        .eq("client_id", client.id)
        .neq("status", "CANCELLED")
        .neq("status", "DRAFT")
        .order("invoice_date", { ascending: false }),
      supabaseAdmin.from("client_agreements")
        .select("id, title, status, valid_until")
        .eq("client_id", client.id)
        .in("status", ["SENT", "VIEWED"])
        .limit(3),
      supabaseAdmin.from("dsc_records")
        .select("id, holder_name, expiry_date, status")
        .eq("client_id", client.id)
        .eq("status", "ACTIVE")
        .order("expiry_date", { ascending: true })
        .limit(3),
    ]);

    const deadlines = deadlinesRes.data ?? [];
    const gstThisMonth = deadlines.find((d) => {
      const cat = (d as { compliance_types?: { category?: string } }).compliance_types?.category;
      return cat === "GST" && d.due_date >= monthStart;
    });

    let gstStatus: "ready" | "pending" | "issue" = "ready";
    if (gstThisMonth) {
      if (gstThisMonth.status === "OVERDUE") gstStatus = "issue";
      else if (gstThisMonth.status !== "COMPLETED") gstStatus = "pending";
    }

    const outstanding = (invoicesRes.data ?? [])
      .filter((i) => !["PAID", "CANCELLED", "DRAFT"].includes(i.status as string))
      .reduce((s, i) => s + Number(i.balance_due), 0);

    const nextDue = deadlines
      .filter((d) => !["COMPLETED", "NOT_APPLICABLE"].includes(d.status as string) && d.due_date >= today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

    const activity: Array<{ at: string; text: string; link?: string }> = [];

    for (const d of deadlines.filter((x) => x.status === "COMPLETED").slice(-8)) {
      const name = (d as { compliance_types?: { name?: string } }).compliance_types?.name ?? "Filing";
      activity.push({
        at: (d as { completed_at?: string }).completed_at ?? d.due_date,
        text: `Your CA filed ${name} for ${d.period_label}`,
        link: "/client/dashboard/compliance",
      });
    }

    for (const r of docReqRes.data ?? []) {
      activity.push({
        at: r.due_date ?? today,
        text: `Your CA requested documents${r.period_label ? ` for ${r.period_label}` : ""} — please upload`,
        link: "/client/requests",
      });
    }

    for (const inv of (invoicesRes.data ?? []).filter((i) => i.sent_at).slice(0, 3)) {
      activity.push({
        at: inv.sent_at as string,
        text: `Invoice ${inv.invoice_number} — ₹${Number(inv.balance_due || inv.total_amount).toLocaleString("en-IN")} due by ${inv.due_date}`,
        link: "/client/dashboard/invoices",
      });
    }

    for (const dsc of dscRes.data ?? []) {
      if (!dsc.expiry_date) continue;
      const days = Math.ceil((new Date(dsc.expiry_date).getTime() - Date.now()) / 86400000);
      if (days <= 60 && days > 0) {
        activity.push({
          at: today,
          text: `Your digital signature certificate expires in ${days} days — contact your CA`,
        });
      }
    }

    activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      client,
      firm,
      summary: {
        gstStatus,
        pendingDocRequests: (docReqRes.data ?? []).length,
        outstandingFees: Math.round(outstanding * 100) / 100,
        nextDue: nextDue
          ? {
              date: nextDue.due_date,
              label: (nextDue as { compliance_types?: { name?: string } }).compliance_types?.name ?? "Filing",
            }
          : null,
      },
      activity: activity.slice(0, 8),
      pendingAgreements: agreementsRes.data ?? [],
    };
  });

export const getClientFilings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { client } = await getClientContext(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const fyStart = today.slice(5) >= "04-01"
      ? `${today.slice(0, 4)}-04-01`
      : `${Number(today.slice(0, 4)) - 1}-04-01`;

    const { data: rows } = await supabaseAdmin
      .from("compliance_deadlines")
      .select("id, due_date, status, period_label, completed_at, filing_reference, compliance_types(name, category)")
      .eq("client_id", client.id)
      .gte("due_date", fyStart)
      .order("due_date", { ascending: false });

    const filings = (rows ?? []).map((d) => {
      const name = (d as { compliance_types?: { name?: string } }).compliance_types?.name ?? "Filing";
      const cat = (d as { compliance_types?: { category?: string } }).compliance_types?.category ?? "";
      let displayStatus: "filed" | "pending" | "late" | "na" = "pending";
      if (d.status === "COMPLETED") {
        const completedDate = d.completed_at ? (d.completed_at as string).slice(0, 10) : d.due_date;
        displayStatus = completedDate <= d.due_date ? "filed" : "late";
      } else if (d.status === "NOT_APPLICABLE") displayStatus = "na";
      else if (d.status === "OVERDUE") displayStatus = "late";

      return {
        id: d.id,
        filingType: name,
        category: cat,
        period: d.period_label,
        dueDate: d.due_date,
        filedOn: d.completed_at ? (d.completed_at as string).slice(0, 10) : null,
        status: displayStatus,
        ackNumber: d.filing_reference,
      };
    });

    const completed = filings.filter((f) => f.status === "filed").length;
    const late = filings.filter((f) => f.status === "late").length;
    const pending = filings.filter((f) => f.status === "pending").length;
    const upcoming = filings.filter((f) => f.status === "pending" && f.dueDate >= today).length;

    return {
      filings,
      stats: {
        totalThisYear: filings.length,
        onTimeRate: completed + late > 0 ? Math.round((completed / (completed + late)) * 100) : 100,
        lateCount: late,
        upcomingCount: upcoming,
      },
    };
  });

export const getClientInvoicesPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { client, firm, billing } = await getClientContext(context.userId);

    const { data: invoices } = await supabaseAdmin
      .from("ca_invoices")
      .select("*, ca_invoice_items(description, total)")
      .eq("client_id", client.id)
      .neq("status", "CANCELLED")
      .neq("status", "DRAFT")
      .order("invoice_date", { ascending: false });

    const { data: proofs } = await supabaseAdmin
      .from("client_payment_proofs")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    const invoiceIds = (invoices ?? []).map((i) => i.id);
    const { data: payments } = invoiceIds.length
      ? await supabaseAdmin
          .from("ca_payments")
          .select("*, ca_invoices(invoice_number, period_label)")
          .in("invoice_id", invoiceIds)
          .order("created_at", { ascending: false })
      : { data: [] };

    const proofByInvoice = new Map((proofs ?? []).map((p) => [p.invoice_id, p]));

    const outstanding = (invoices ?? [])
      .filter((i) => !["PAID"].includes(i.status as string) && Number(i.balance_due) > 0)
      .map((i) => ({
        ...i,
        items: (i as { ca_invoice_items?: { description: string; total: number }[] }).ca_invoice_items ?? [],
        proofPending: proofByInvoice.get(i.id)?.status === "PENDING",
      }));

    return { outstanding, payments: payments ?? [], billing: billing ?? null, firmName: firm?.name };
  });

export const submitPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      invoiceId: z.string().uuid(),
      amount: z.number().positive(),
      referenceNumber: z.string().max(80).optional(),
      fileBase64: z.string().min(1),
      fileName: z.string().min(1).max(200),
      mimeType: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { client, userId } = await getClientContext(context.userId);

    const { data: inv } = await supabaseAdmin
      .from("ca_invoices")
      .select("id, invoice_number")
      .eq("id", data.invoiceId)
      .eq("client_id", client.id)
      .single();
    if (!inv) throw new Error("Invoice not found");

    const buf = Buffer.from(data.fileBase64, "base64");
    const path = `${client.ca_firm_id}/${client.id}/${data.invoiceId}/${Date.now()}-${data.fileName}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("payment-proofs")
      .upload(path, buf, { contentType: data.mimeType ?? "image/jpeg" });
    if (upErr) throw new Error(upErr.message);

    const { error } = await supabaseAdmin.from("client_payment_proofs").insert({
      invoice_id: data.invoiceId,
      ca_firm_id: client.ca_firm_id,
      client_id: client.id,
      amount: data.amount,
      proof_file_path: path,
      reference_number: data.referenceNumber ?? null,
      status: "PENDING",
      submitted_by: userId,
    });
    if (error) throw new Error(error.message);

    await notifyCaFirm(client.ca_firm_id, {
      title: "Payment proof submitted",
      body: `${client.business_name} submitted proof for ${inv.invoice_number}`,
      link: `/ca/billing/${data.invoiceId}`,
    });

    return { ok: true };
  });

export const getClientComplianceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { client } = await getClientContext(context.userId);
    const today = new Date().toISOString().slice(0, 10);

    const { data: deadlines } = await supabaseAdmin
      .from("compliance_deadlines")
      .select("id, due_date, status, period_label, completed_at, compliance_types(name, category)")
      .eq("client_id", client.id)
      .order("due_date", { ascending: true });

    const rows = deadlines ?? [];
    const overdue = rows.filter((d) => d.status === "OVERDUE").length;
    const pending = rows.filter((d) => ["PENDING", "IN_PROGRESS"].includes(d.status as string)).length;

    let traffic: "green" | "yellow" | "red" = "green";
    if (overdue > 0) traffic = "red";
    else if (pending > 0) traffic = "yellow";

    const upcoming = rows
      .filter((d) => !["COMPLETED", "NOT_APPLICABLE"].includes(d.status as string) && d.due_date >= today)
      .slice(0, 8)
      .map((d) => ({
        id: d.id,
        plainText: `Your ${(d as { compliance_types?: { name?: string } }).compliance_types?.name} for ${d.period_label} is due on ${formatPlainDate(d.due_date)}`,
        dueDate: d.due_date,
      }));

    const completed = rows
      .filter((d) => d.status === "COMPLETED")
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
      .slice(0, 10)
      .map((d) => ({
        label: `${(d as { compliance_types?: { name?: string } }).compliance_types?.name} — ${d.period_label}`,
        filedOn: d.completed_at ? formatPlainDate((d.completed_at as string).slice(0, 10)) : "—",
      }));

    const { data: noticeTasks } = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("client_id", client.id)
      .eq("task_type", "NOTICE_REPLY")
      .not("status", "in", '("COMPLETED","CANCELLED")');

    return { traffic, upcoming, completed, openNotices: (noticeTasks ?? []).length };
  });

export const listClientQueries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { client } = await getClientContext(context.userId);
    const { data } = await supabaseAdmin
      .from("client_queries")
      .select("id, subject, status, priority, created_at, updated_at, client_rating")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });
    return { queries: data ?? [] };
  });

export const createClientQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(5000),
      priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { client, userId } = await getClientContext(context.userId);

    const { data: owner } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("ca_firm_id", client.ca_firm_id)
      .eq("role", "ca_owner")
      .limit(1)
      .maybeSingle();

    const { data: row, error } = await supabaseAdmin
      .from("client_queries")
      .insert({
        ca_firm_id: client.ca_firm_id,
        client_id: client.id,
        subject: data.subject,
        body: data.body,
        priority: data.priority ?? "NORMAL",
        assigned_to: owner?.user_id ?? null,
        status: "OPEN",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("client_query_replies").insert({
      query_id: row!.id,
      replied_by_type: "CLIENT",
      replied_by_id: userId,
      message: data.body,
    });

    await notifyCaFirm(client.ca_firm_id, {
      title: "New client query",
      body: `${client.business_name}: ${data.subject}`,
      link: `/ca/clients/${client.id}`,
      userId: owner?.user_id ?? null,
    });

    return { id: row!.id };
  });

export const getClientQueryThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ queryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { client } = await getClientContext(context.userId);

    const { data: query } = await supabaseAdmin
      .from("client_queries")
      .select("*")
      .eq("id", data.queryId)
      .eq("client_id", client.id)
      .single();
    if (!query) throw new Error("Query not found");

    const { data: replies } = await supabaseAdmin
      .from("client_query_replies")
      .select("*")
      .eq("query_id", data.queryId)
      .order("created_at", { ascending: true });

    const ids = Array.from(new Set((replies ?? []).map((r) => r.replied_by_id)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
      for (const p of profs ?? []) names.set(p.id, (p.full_name as string) || "User");
    }

    return {
      query,
      replies: (replies ?? []).map((r) => ({
        ...r,
        senderName: r.replied_by_type === "CLIENT" ? "You" : names.get(r.replied_by_id) ?? "CA Team",
        isMine: r.replied_by_type === "CLIENT",
      })),
    };
  });

export const replyCaStaffToQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ queryId: z.string().uuid(), message: z.string().min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("ca_firm_id")
      .eq("user_id", context.userId)
      .in("role", ["ca_owner", "ca_staff"])
      .limit(1)
      .maybeSingle();
    if (!role?.ca_firm_id) throw new Error("CA access required");

    const { data: query } = await supabaseAdmin
      .from("client_queries")
      .select("id, subject, status, client_id")
      .eq("id", data.queryId)
      .eq("ca_firm_id", role.ca_firm_id)
      .single();
    if (!query) throw new Error("Query not found");

    await supabaseAdmin.from("client_query_replies").insert({
      query_id: data.queryId,
      replied_by_type: "CA_STAFF",
      replied_by_id: context.userId,
      message: data.message,
    });

    if (query.status === "OPEN") {
      await supabaseAdmin.from("client_queries").update({ status: "IN_PROGRESS" }).eq("id", data.queryId);
    }

    const { notifyClientPortal } = await import("./client-notifications.server");
    await notifyClientPortal({
      caFirmId: role.ca_firm_id,
      clientId: query.client_id,
      type: "query_reply",
      title: "Reply from your CA",
      body: query.subject,
      link: "/client/dashboard/queries",
    });

    return { ok: true };
  });

export const replyClientQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ queryId: z.string().uuid(), message: z.string().min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { client, userId } = await getClientContext(context.userId);

    const { data: query } = await supabaseAdmin
      .from("client_queries")
      .select("id, subject, status")
      .eq("id", data.queryId)
      .eq("client_id", client.id)
      .single();
    if (!query) throw new Error("Query not found");
    if (query.status === "CLOSED") throw new Error("This query is closed");

    await supabaseAdmin.from("client_query_replies").insert({
      query_id: data.queryId,
      replied_by_type: "CLIENT",
      replied_by_id: userId,
      message: data.message,
    });

    if (query.status === "RESOLVED") {
      await supabaseAdmin.from("client_queries").update({ status: "OPEN" }).eq("id", data.queryId);
    }

    await notifyCaFirm(client.ca_firm_id, {
      title: "Client replied to query",
      body: query.subject,
      link: `/ca/clients/${client.id}`,
    });

    return { ok: true };
  });

export const rateClientQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      queryId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { client } = await getClientContext(context.userId);
    const { error } = await supabaseAdmin
      .from("client_queries")
      .update({ client_rating: data.rating, client_rating_comment: data.comment ?? null })
      .eq("id", data.queryId)
      .eq("client_id", client.id)
      .eq("status", "RESOLVED");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listClientNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { client } = await getClientContext(context.userId);
    const { data } = await supabaseAdmin
      .from("client_notifications")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const unread = (data ?? []).filter((n) => !n.read_at).length;
    return { notifications: data ?? [], unread };
  });

export const markClientNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { client } = await getClientContext(context.userId);
    await supabaseAdmin
      .from("client_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", client.id)
      .is("read_at", null);
    return { ok: true };
  });

export const getClientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { client, firm, userId } = await getClientContext(context.userId);
    const { data: profile } = await supabaseAdmin.from("profiles").select("full_name, id").eq("id", userId).single();
    return { client, firm, profile };
  });

export const getClientPendingTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { client } = await getClientContext(context.userId);
    const today = new Date().toISOString().slice(0, 10);

    const [docReqRes, agreementsRes, onboardingRes] = await Promise.all([
      supabaseAdmin
        .from("document_requests")
        .select("id, doc_type, period_label, note, due_date, status, created_at")
        .eq("client_id", client.id)
        .in("status", ["pending", "partial"])
        .order("due_date", { ascending: true }),
      supabaseAdmin
        .from("client_agreements")
        .select("id, title, status, valid_until, sent_at")
        .eq("client_id", client.id)
        .in("status", ["SENT", "VIEWED"])
        .order("sent_at", { ascending: false }),
      supabaseAdmin
        .from("client_onboarding")
        .select("id, client_onboarding_items(id, item_name, status)")
        .eq("client_id", client.id)
        .limit(1),
    ]);

    const docTypeLabels: Record<string, string> = {
      purchase_bills: "Purchase bills",
      sales_invoices: "Sales invoices",
      bank_statement: "Bank statement",
      expense_proofs: "Expense proofs",
      other: "Documents",
    };

    const tasks = [
      ...(docReqRes.data ?? []).map((r) => ({
        id: r.id,
        kind: "document" as const,
        title: `Upload ${docTypeLabels[r.doc_type] ?? r.doc_type}${r.period_label ? ` — ${r.period_label}` : ""}`,
        detail: r.note ?? "Your CA needs these documents to proceed.",
        dueDate: r.due_date,
        overdue: r.due_date ? r.due_date < today : false,
        link: "/client/requests",
      })),
      ...(agreementsRes.data ?? []).map((a) => ({
        id: a.id,
        kind: "agreement" as const,
        title: `Sign agreement: ${a.title}`,
        detail: "Review and sign to continue services.",
        dueDate: a.valid_until,
        overdue: false,
        link: "/client/agreements",
      })),
      ...(onboardingRes.data ?? []).flatMap((ob) =>
        ((ob as { client_onboarding_items?: { id: string; item_name: string; status: string }[] }).client_onboarding_items ?? [])
          .filter((i) => !["APPROVED", "WAIVED"].includes(i.status))
          .map((i) => ({
            id: i.id,
            kind: "onboarding" as const,
            title: i.item_name,
            detail: "Complete this onboarding step.",
            dueDate: null as string | null,
            overdue: false,
            link: "/client/dashboard/home",
          })),
      ),
    ];

    return { tasks };
  });
