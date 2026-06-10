// Server functions for bank reconciliation.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cleanDescription, parseExcelOrCsv, parsePdfWithAI } from "./bank.parsers.server";
import { matchTransaction } from "./bank.match.server";
import { buildReconciliationReport } from "./bank.export.server";

const admin = supabaseAdmin as any;

async function getFirmIdForUser(userId: string): Promise<string> {
  const { data } = await admin
    .from("user_roles")
    .select("ca_firm_id")
    .eq("user_id", userId)
    .in("role", ["ca_owner", "ca_staff"])
    .limit(1)
    .maybeSingle();
  if (!data?.ca_firm_id) throw new Error("Not a CA firm member");
  return data.ca_firm_id as string;
}

async function isOwner(userId: string, firmId: string): Promise<boolean> {
  const { data } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("ca_firm_id", firmId)
    .eq("role", "ca_owner")
    .maybeSingle();
  return !!data;
}

async function assertClientAccess(firmId: string, clientId: string) {
  const { data } = await admin
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("ca_firm_id", firmId)
    .maybeSingle();
  if (!data) throw new Error("Client not found in this firm");
}

async function getSettings(firmId: string) {
  const { data } = await admin.from("bank_recon_settings").select("*").eq("ca_firm_id", firmId).maybeSingle();
  return (
    data ?? {
      ca_firm_id: firmId,
      match_tolerance: 1,
      auto_exclude_below: 0,
      date_window_days: 30,
    }
  );
}

/* ============== UPLOAD ============== */

export const uploadBankStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientId: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        fileBase64: z.string().min(1),
        accountNumber: z.string().max(40).optional(),
        accountType: z.enum(["CURRENT", "SAVINGS", "OD", "CC"]).default("CURRENT"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    await assertClientAccess(firmId, data.clientId);

    const lower = data.fileName.toLowerCase();
    const fileType: "PDF" | "EXCEL" | "CSV" = lower.endsWith(".pdf")
      ? "PDF"
      : lower.endsWith(".csv")
        ? "CSV"
        : "EXCEL";

    const statementId = crypto.randomUUID();
    const path = `${firmId}/${data.clientId}/bank-statements/${statementId}/${data.fileName}`;
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const { error: upErr } = await admin.storage.from("invoices").upload(path, bytes, {
      contentType: fileType === "PDF" ? "application/pdf" : "application/octet-stream",
      upsert: false,
    });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { error } = await admin.from("bank_statements").insert({
      id: statementId,
      ca_firm_id: firmId,
      client_id: data.clientId,
      bank_name: "Detecting…",
      account_number: data.accountNumber ? data.accountNumber.slice(-4) : null,
      account_type: data.accountType,
      file_url: path,
      file_type: fileType,
      uploaded_by: context.userId,
      reconciliation_status: "NOT_STARTED",
    });
    if (error) throw new Error(error.message);

    return { statementId, fileType };
  });

/* ============== PARSE + AUTO-MATCH ============== */

export const parseAndStageStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ statementId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);

    const { data: stmt } = await admin
      .from("bank_statements")
      .select("*")
      .eq("id", data.statementId)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!stmt) throw new Error("Statement not found");

    await admin
      .from("bank_statements")
      .update({ reconciliation_status: "IN_PROGRESS", parse_error: null })
      .eq("id", stmt.id);

    try {
      const { data: file, error: dlErr } = await admin.storage.from("invoices").download(stmt.file_url);
      if (dlErr || !file) throw new Error("Could not read uploaded file");
      const buf = new Uint8Array(await file.arrayBuffer());

      let parsed;
      if (stmt.file_type === "PDF") {
        const base64 = btoa(String.fromCharCode(...buf));
        parsed = await parsePdfWithAI(base64, stmt.file_url.split("/").pop() || "statement.pdf");
      } else {
        parsed = await parseExcelOrCsv(buf, stmt.file_url.split("/").pop() || "statement");
      }

      // Load rules + settings
      const settings = await getSettings(firmId);
      const { data: rules } = await admin
        .from("reconciliation_rules")
        .select("id, description_contains, amount_min, amount_max, category")
        .eq("ca_firm_id", firmId)
        .eq("is_active", true);

      // Wipe any prior txns for this statement
      await admin.from("bank_transactions").delete().eq("statement_id", stmt.id);

      // Auto-match each
      let credits = 0;
      let debits = 0;
      let reconciled = 0;
      const rows = [] as any[];
      for (let i = 0; i < parsed.txns.length; i++) {
        const t = parsed.txns[i];
        if (Number(settings.auto_exclude_below) > 0 && t.amount < Number(settings.auto_exclude_below)) {
          rows.push({
            statement_id: stmt.id,
            ca_firm_id: firmId,
            client_id: stmt.client_id,
            transaction_date: t.transaction_date,
            value_date: t.value_date ?? null,
            description: t.description,
            cleaned_description: cleanDescription(t.description),
            transaction_type: t.transaction_type,
            amount: t.amount,
            balance_after: t.balance_after ?? null,
            reference_number: t.reference_number ?? null,
            category: "UNKNOWN",
            reconciliation_status: "EXCLUDED",
            row_index: i,
          });
          if (t.transaction_type === "CREDIT") credits += t.amount;
          else debits += t.amount;
          continue;
        }

        const outcome = await matchTransaction({
          firmId,
          clientId: stmt.client_id,
          txn: t,
          tolerance: Number(settings.match_tolerance),
          dateWindowDays: Number(settings.date_window_days),
          rules: (rules as any[]) || [],
        });
        if (outcome.reconciliation_status === "MATCHED") reconciled++;
        if (t.transaction_type === "CREDIT") credits += t.amount;
        else debits += t.amount;
        rows.push({
          statement_id: stmt.id,
          ca_firm_id: firmId,
          client_id: stmt.client_id,
          transaction_date: t.transaction_date,
          value_date: t.value_date ?? null,
          description: t.description,
          cleaned_description: cleanDescription(t.description),
          transaction_type: t.transaction_type,
          amount: t.amount,
          balance_after: t.balance_after ?? null,
          reference_number: t.reference_number ?? null,
          category: outcome.category,
          reconciliation_status: outcome.reconciliation_status,
          matched_invoice_id: outcome.matched_invoice_id,
          match_confidence: outcome.match_confidence,
          matched_by: outcome.matched_by,
          row_index: i,
        });
      }

      if (rows.length) {
        // chunk inserts
        const chunk = 200;
        for (let i = 0; i < rows.length; i += chunk) {
          const { error } = await admin.from("bank_transactions").insert(rows.slice(i, i + chunk));
          if (error) throw new Error(error.message);
        }
      }

      await admin
        .from("bank_statements")
        .update({
          bank_name: parsed.bank || stmt.bank_name,
          statement_period_from: parsed.period_from,
          statement_period_to: parsed.period_to,
          opening_balance: parsed.opening_balance,
          closing_balance: parsed.closing_balance,
          total_credits: credits,
          total_debits: debits,
          transaction_count: rows.length,
          reconciled_count: reconciled,
          unreconciled_count: rows.length - reconciled,
          reconciliation_status:
            rows.length === 0 ? "NOT_STARTED" : reconciled === rows.length ? "COMPLETED" : "IN_PROGRESS",
        })
        .eq("id", stmt.id);

      return {
        ok: true,
        txnCount: rows.length,
        reconciled,
        needsManualMapping: !!parsed.needs_manual_mapping,
      };
    } catch (e: any) {
      await admin
        .from("bank_statements")
        .update({ reconciliation_status: "NOT_STARTED", parse_error: e?.message || "Parse failed" })
        .eq("id", stmt.id);
      throw e;
    }
  });

/* ============== READ ============== */

export const listStatements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    await assertClientAccess(firmId, data.clientId);
    const { data: rows } = await admin
      .from("bank_statements")
      .select(
        "id, bank_name, account_number, account_type, file_type, statement_period_from, statement_period_to, opening_balance, closing_balance, total_credits, total_debits, transaction_count, reconciliation_status, reconciled_count, unreconciled_count, parse_error, created_at",
      )
      .eq("ca_firm_id", firmId)
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false });
    return { statements: (rows as any[]) || [] };
  });

export const getStatementDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ statementId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data: stmt } = await admin
      .from("bank_statements")
      .select("*")
      .eq("id", data.statementId)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!stmt) throw new Error("Statement not found");
    const { data: txns } = await admin
      .from("bank_transactions")
      .select("*")
      .eq("statement_id", stmt.id)
      .order("transaction_date", { ascending: true })
      .order("row_index", { ascending: true })
      .limit(2000);

    const invoiceIds = Array.from(new Set((txns || []).map((t: any) => t.matched_invoice_id).filter(Boolean)));
    let invoices: any[] = [];
    if (invoiceIds.length) {
      const { data: invs } = await admin
        .from("invoices")
        .select("id, invoice_number, invoice_date, total_amount, vendor_name, buyer_name, status")
        .in("id", invoiceIds);
      invoices = (invs as any[]) || [];
    }
    return { statement: stmt, transactions: (txns as any[]) || [], invoices };
  });

/* ============== MATCH ACTIONS ============== */

export const confirmMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ transactionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { error } = await admin
      .from("bank_transactions")
      .update({ reconciliation_status: "MANUALLY_MATCHED", matched_by: "MANUAL" })
      .eq("id", data.transactionId)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkConfirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ transactionIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { error } = await admin
      .from("bank_transactions")
      .update({ reconciliation_status: "MANUALLY_MATCHED", matched_by: "MANUAL" })
      .in("id", data.transactionIds)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.transactionIds.length };
  });

export const rejectMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ transactionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { error } = await admin
      .from("bank_transactions")
      .update({
        reconciliation_status: "UNMATCHED",
        matched_invoice_id: null,
        match_confidence: null,
        matched_by: null,
      })
      .eq("id", data.transactionId)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const manualMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ transactionId: z.string().uuid(), invoiceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data: inv } = await admin
      .from("invoices")
      .select("id")
      .eq("id", data.invoiceId)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!inv) throw new Error("Invoice not found");
    const { error } = await admin
      .from("bank_transactions")
      .update({
        matched_invoice_id: data.invoiceId,
        match_confidence: 1,
        matched_by: "MANUAL",
        reconciliation_status: "MANUALLY_MATCHED",
      })
      .eq("id", data.transactionId)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excludeTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ transactionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { error } = await admin
      .from("bank_transactions")
      .update({ reconciliation_status: "EXCLUDED" })
      .eq("id", data.transactionId)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addTxnNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ transactionId: z.string().uuid(), note: z.string().max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { error } = await admin
      .from("bank_transactions")
      .update({ notes: data.note })
      .eq("id", data.transactionId)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============== SEARCH INVOICES ============== */

export const searchInvoicesForMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientId: z.string().uuid(),
        amount: z.number().optional(),
        tolerance: z.number().default(10),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        q: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    await assertClientAccess(firmId, data.clientId);
    let qb = admin
      .from("invoices")
      .select("id, invoice_number, invoice_date, total_amount, vendor_name, buyer_name, status")
      .eq("ca_firm_id", firmId)
      .eq("client_id", data.clientId)
      .limit(50);
    if (data.amount != null) {
      qb = qb.gte("total_amount", data.amount - data.tolerance).lte("total_amount", data.amount + data.tolerance);
    }
    if (data.dateFrom) qb = qb.gte("invoice_date", data.dateFrom);
    if (data.dateTo) qb = qb.lte("invoice_date", data.dateTo);
    if (data.q && data.q.trim()) {
      const q = data.q.trim();
      qb = qb.or(`invoice_number.ilike.%${q}%,vendor_name.ilike.%${q}%,buyer_name.ilike.%${q}%`);
    }
    const { data: rows } = await qb;
    return { invoices: (rows as any[]) || [] };
  });

/* ============== EXPORT ============== */

export const downloadReconciliationReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ statementId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data: stmt } = await admin
      .from("bank_statements")
      .select("*")
      .eq("id", data.statementId)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (!stmt) throw new Error("Statement not found");
    const { data: txns } = await admin
      .from("bank_transactions")
      .select("*")
      .eq("statement_id", stmt.id)
      .order("transaction_date", { ascending: true });
    const invoiceIds = Array.from(new Set((txns || []).map((t: any) => t.matched_invoice_id).filter(Boolean)));
    let invoiceById: Record<string, any> = {};
    if (invoiceIds.length) {
      const { data: invs } = await admin
        .from("invoices")
        .select("id, invoice_number, invoice_date, total_amount, vendor_name, buyer_name")
        .in("id", invoiceIds);
      for (const inv of (invs as any[]) || []) invoiceById[inv.id] = inv;
    }
    const bytes = buildReconciliationReport({
      statement: stmt,
      transactions: (txns as any[]) || [],
      invoiceById,
    });
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return {
      filename: `reconciliation-${stmt.bank_name}-${stmt.statement_period_from ?? "report"}.xlsx`,
      base64: btoa(bin),
    };
  });

/* ============== RULES + SETTINGS ============== */

export const listReconRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data } = await admin
      .from("reconciliation_rules")
      .select("*")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false });
    const settings = await getSettings(firmId);
    const owner = await isOwner(context.userId, firmId);
    return { rules: (data as any[]) || [], settings, canEdit: owner };
  });

export const upsertReconRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        rule_name: z.string().min(1).max(120),
        description_contains: z.string().min(1).max(200),
        amount_min: z.number().nullable().optional(),
        amount_max: z.number().nullable().optional(),
        category: z.enum([
          "SALES_RECEIPT",
          "PURCHASE_PAYMENT",
          "TAX_PAYMENT",
          "SALARY",
          "BANK_CHARGES",
          "LOAN",
          "INTEREST",
          "UNKNOWN",
        ]),
        is_active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    if (!(await isOwner(context.userId, firmId))) throw new Error("Only firm owners can edit rules");
    const payload = {
      ca_firm_id: firmId,
      rule_name: data.rule_name,
      description_contains: data.description_contains,
      amount_min: data.amount_min ?? null,
      amount_max: data.amount_max ?? null,
      category: data.category,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await admin
        .from("reconciliation_rules")
        .update(payload)
        .eq("id", data.id)
        .eq("ca_firm_id", firmId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await admin
      .from("reconciliation_rules")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteReconRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    if (!(await isOwner(context.userId, firmId))) throw new Error("Only firm owners can delete rules");
    const { error } = await admin
      .from("reconciliation_rules")
      .delete()
      .eq("id", data.id)
      .eq("ca_firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateReconSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        match_tolerance: z.number().min(0).max(10000),
        auto_exclude_below: z.number().min(0).max(100000),
        date_window_days: z.number().int().min(1).max(180),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    if (!(await isOwner(context.userId, firmId))) throw new Error("Only firm owners can change settings");
    const { error } = await admin
      .from("bank_recon_settings")
      .upsert({ ca_firm_id: firmId, ...data }, { onConflict: "ca_firm_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
