import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseTallyFile, type ParsedRow } from "./tally.parsers.server";
import { extractLedgers, suggestForLedger, type Suggestion } from "./tally.mapping.server";
import { buildTallyVoucherXml } from "./tally.export.server";

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

async function assertClientAccess(firmId: string, clientId: string) {
  const { data } = await admin.from("clients").select("id").eq("id", clientId).eq("ca_firm_id", firmId).maybeSingle();
  if (!data) throw new Error("Client not found in this firm");
}

/* ============================ UPLOAD ============================ */

export const uploadTallyFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid(),
      importType: z.enum(["SALES_LEDGER", "PURCHASE_LEDGER", "GSTR1_DATA", "GSTR2_DATA", "FULL_BACKUP"]),
      fileName: z.string().min(1).max(255),
      fileBase64: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    await assertClientAccess(firmId, data.clientId);

    const importId = crypto.randomUUID();
    const path = `${firmId}/${data.clientId}/tally-imports/${importId}/${data.fileName}`;
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const { error: upErr } = await admin.storage.from("invoices").upload(path, bytes, {
      contentType: "application/octet-stream",
      upsert: false,
    });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { error } = await admin.from("tally_imports").insert({
      id: importId,
      ca_firm_id: firmId,
      client_id: data.clientId,
      import_type: data.importType,
      file_name: data.fileName,
      file_url: path,
      import_status: "UPLOADED",
      imported_by: context.userId,
    });
    if (error) throw new Error(error.message);

    return { importId };
  });

/* ============================ PARSE ============================ */

export const parseTallyImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ importId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data: imp } = await admin.from("tally_imports").select("*").eq("id", data.importId).eq("ca_firm_id", firmId).maybeSingle();
    if (!imp) throw new Error("Import not found");

    await admin.from("tally_imports").update({ import_status: "PROCESSING" }).eq("id", imp.id);

    const { data: file, error: dlErr } = await admin.storage.from("invoices").download(imp.file_url);
    if (dlErr || !file) {
      await admin.from("tally_imports").update({ import_status: "FAILED" }).eq("id", imp.id);
      throw new Error(`Download failed: ${dlErr?.message}`);
    }
    const buf = await file.arrayBuffer();

    let parsed;
    try {
      parsed = parseTallyFile({ fileName: imp.file_name, content: buf, importType: imp.import_type });
    } catch (e: any) {
      await admin.from("tally_imports").update({ import_status: "FAILED", error_log: [{ error: e.message }] }).eq("id", imp.id);
      throw new Error(`Parse failed: ${e.message}`);
    }

    await admin
      .from("tally_imports")
      .update({
        total_records: parsed.rows.length,
        tally_version: parsed.version,
        period_from: parsed.periodFrom,
        period_to: parsed.periodTo,
        staging_data: parsed.rows as any,
        import_status: parsed.rows.length === 0 ? "FAILED" : "UPLOADED",
      })
      .eq("id", imp.id);

    return {
      total: parsed.rows.length,
      version: parsed.version,
      periodFrom: parsed.periodFrom,
      periodTo: parsed.periodTo,
      ledgers: extractLedgers(parsed.rows),
      sampleRows: parsed.rows.slice(0, 10),
    };
  });

/* ============================ SUGGEST MAPPINGS ============================ */

export const getSuggestedMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ importId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data: imp } = await admin.from("tally_imports").select("*").eq("id", data.importId).eq("ca_firm_id", firmId).maybeSingle();
    if (!imp) throw new Error("Import not found");

    const ledgers: string[] = extractLedgers((imp.staging_data ?? []) as ParsedRow[]);
    const { data: existing } = await admin.from("tally_mappings").select("*").eq("ca_firm_id", firmId);
    const existingMap = new Map<string, any>();
    for (const m of existing ?? []) existingMap.set(String(m.tally_ledger_name).toLowerCase(), m);

    const out: Array<{
      ledger: string;
      category: string;
      rate: number;
      hsn: string | null;
      source: "history" | "heuristic" | "ai";
      confirmed: boolean;
    }> = [];

    for (const l of ledgers) {
      const hit = existingMap.get(l.toLowerCase());
      if (hit) {
        out.push({ ledger: l, category: hit.gst_category, rate: Number(hit.gst_rate), hsn: hit.hsn_code, source: "history", confirmed: true });
      } else {
        const s: Suggestion = await suggestForLedger(l);
        out.push({ ledger: l, category: s.category, rate: s.rate, hsn: s.hsn, source: s.source, confirmed: false });
      }
    }
    return { suggestions: out };
  });

/* ============================ SAVE MAPPINGS ============================ */

const MappingInput = z.object({
  ledger: z.string().min(1),
  category: z.enum(["SALES", "PURCHASE", "EXPENSE", "ASSET"]),
  rate: z.number().min(0).max(100),
  hsn: z.string().nullable().optional(),
});

export const saveMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      importId: z.string().uuid(),
      mappings: z.array(MappingInput).min(1),
      persistForFuture: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    if (data.persistForFuture) {
      for (const m of data.mappings) {
        await admin.from("tally_mappings").upsert(
          {
            ca_firm_id: firmId,
            tally_ledger_name: m.ledger,
            gst_category: m.category,
            gst_rate: m.rate,
            hsn_code: m.hsn ?? null,
            is_confirmed: true,
            created_by: context.userId,
          },
          { onConflict: "ca_firm_id,tally_ledger_name" as any },
        );
      }
    }
    // store mapping decisions on the import for preview/import phases
    await admin.from("tally_imports").update({ error_log: { mappings: data.mappings } as any }).eq("id", data.importId).eq("ca_firm_id", firmId);
    return { ok: true };
  });

/* ============================ PREVIEW & IMPORT ============================ */

function fuzzyKey(party: string | null, amount: number, date: string | null) {
  return `${(party ?? "").toLowerCase().trim()}|${Math.round(amount)}|${date ?? ""}`;
}

export const previewImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ importId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data: imp } = await admin.from("tally_imports").select("*").eq("id", data.importId).eq("ca_firm_id", firmId).maybeSingle();
    if (!imp) throw new Error("Import not found");

    const rows: ParsedRow[] = (imp.staging_data ?? []) as ParsedRow[];
    const { data: existingInv } = await admin
      .from("invoices")
      .select("invoice_number,invoice_date,vendor_name,buyer_name,total_amount")
      .eq("client_id", imp.client_id);
    const exactSet = new Set<string>();
    const fuzzySet = new Set<string>();
    for (const e of existingInv ?? []) {
      if (e.invoice_number && e.invoice_date) exactSet.add(`${e.invoice_number}|${e.invoice_date}`);
      fuzzySet.add(fuzzyKey(e.vendor_name ?? e.buyer_name ?? null, Number(e.total_amount ?? 0), e.invoice_date));
    }

    let ready = 0, warnings = 0, errors = 0, duplicates = 0;
    const sample: Array<ParsedRow & { status: "READY" | "WARNING" | "ERROR" | "DUPLICATE"; reason?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      let status: "READY" | "WARNING" | "ERROR" | "DUPLICATE" = "READY";
      let reason: string | undefined;
      if (!r.date || !r.amount) { status = "ERROR"; reason = "Missing date or amount"; errors++; }
      else if (r.voucherNo && exactSet.has(`${r.voucherNo}|${r.date}`)) { status = "DUPLICATE"; reason = "Same invoice number + date already exists"; duplicates++; }
      else if (fuzzySet.has(fuzzyKey(r.party, r.amount, r.date))) { status = "WARNING"; reason = "Possible duplicate (party + amount + date)"; warnings++; }
      else if (!r.party) { status = "WARNING"; reason = "Party name missing"; warnings++; }
      else { ready++; }
      if (sample.length < 10) sample.push({ ...r, status, reason });
    }

    return { ready, warnings, errors, duplicates, sample, total: rows.length };
  });

export const runImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      importId: z.string().uuid(),
      duplicateStrategy: z.enum(["SKIP", "OVERWRITE", "ALLOW"]).default("SKIP"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data: imp } = await admin.from("tally_imports").select("*").eq("id", data.importId).eq("ca_firm_id", firmId).maybeSingle();
    if (!imp) throw new Error("Import not found");
    await admin.from("tally_imports").update({ import_status: "PROCESSING" }).eq("id", imp.id);

    const rows: ParsedRow[] = (imp.staging_data ?? []) as ParsedRow[];
    const { data: existing } = await admin
      .from("invoices")
      .select("id,invoice_number,invoice_date")
      .eq("client_id", imp.client_id);
    const existingMap = new Map<string, string>();
    for (const e of existing ?? []) if (e.invoice_number && e.invoice_date) existingMap.set(`${e.invoice_number}|${e.invoice_date}`, e.id);

    let imported = 0, failed = 0;
    const errLog: Array<{ row: number; error: string; voucher: string | null }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.date || !r.amount) { failed++; errLog.push({ row: i + 1, error: "Missing date/amount", voucher: r.voucherNo }); continue; }
        const key = r.voucherNo ? `${r.voucherNo}|${r.date}` : null;
        const dup = key ? existingMap.get(key) : null;
        if (dup && data.duplicateStrategy === "SKIP") continue;
        const payload: any = {
          ca_firm_id: firmId,
          client_id: imp.client_id,
          uploaded_by: context.userId,
          status: "approved",
          invoice_number: r.voucherNo,
          invoice_date: r.date,
          vendor_name: r.voucherType === "Purchase" ? r.party : null,
          buyer_name: r.voucherType === "Sales" ? r.party : null,
          taxable_value: r.taxableValue ?? r.amount,
          cgst: r.cgst ?? 0,
          sgst: r.sgst ?? 0,
          igst: r.igst ?? 0,
          total_amount: r.amount,
          notes: r.narration,
          raw_extraction: { source: "tally_import", import_id: imp.id, ledger: r.ledger } as any,
        };
        if (dup && data.duplicateStrategy === "OVERWRITE") {
          await admin.from("invoices").update(payload).eq("id", dup);
        } else {
          await admin.from("invoices").insert(payload);
        }
        imported++;
      } catch (e: any) {
        failed++;
        errLog.push({ row: i + 1, error: e.message ?? String(e), voucher: r.voucherNo });
      }
    }

    const status = failed === 0 ? "COMPLETED" : imported === 0 ? "FAILED" : "PARTIAL";
    await admin.from("tally_imports").update({
      import_status: status,
      imported_records: imported,
      failed_records: failed,
      error_log: errLog as any,
    }).eq("id", imp.id);

    return { imported, failed, status };
  });

/* ============================ LIST / HISTORY ============================ */

export const listImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data: rows } = await admin
      .from("tally_imports")
      .select("id,import_type,tally_version,import_status,total_records,imported_records,failed_records,period_from,period_to,file_name,created_at,imported_by")
      .eq("ca_firm_id", firmId)
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false });
    return { imports: rows ?? [] };
  });

/* ============================ MAPPING LIBRARY ============================ */

export const listMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data } = await admin.from("tally_mappings").select("*").eq("ca_firm_id", firmId).order("tally_ledger_name");
    return { mappings: (data ?? []) as Array<any> };
  });

export const updateMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      category: z.enum(["SALES", "PURCHASE", "EXPENSE", "ASSET"]),
      rate: z.number().min(0).max(100),
      hsn: z.string().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    await admin.from("tally_mappings").update({ gst_category: data.category, gst_rate: data.rate, hsn_code: data.hsn })
      .eq("id", data.id).eq("ca_firm_id", firmId);
    return { ok: true };
  });

export const deleteMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    await admin.from("tally_mappings").delete().eq("id", data.id).eq("ca_firm_id", firmId);
    return { ok: true };
  });

export const resetMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    await admin.from("tally_mappings").delete().eq("ca_firm_id", firmId);
    return { ok: true };
  });

/* ============================ EXPORT ============================ */

export const generateTallyExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid(),
      periodFrom: z.string(),
      periodTo: z.string(),
      includeSales: z.boolean().default(true),
      includePurchase: z.boolean().default(false),
      includeJournal: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    await assertClientAccess(firmId, data.clientId);

    const { data: client } = await admin.from("clients").select("business_name,gstin").eq("id", data.clientId).maybeSingle();
    const { data: invs } = await admin
      .from("ca_invoices")
      .select("invoice_number,invoice_date,total_amount,gst_amount,subtotal,notes,is_inter_state,cgst_amount,sgst_amount,igst_amount")
      .eq("ca_firm_id", firmId)
      .eq("client_id", data.clientId)
      .gte("invoice_date", data.periodFrom)
      .lte("invoice_date", data.periodTo)
      .order("invoice_date");

    const xml = buildTallyVoucherXml({
      invoices: (invs ?? []).map((i: any) => ({
        ...i,
        client_name: client?.business_name ?? null,
        client_gstin: client?.gstin ?? null,
      })),
      includeSales: data.includeSales,
      includePurchase: data.includePurchase,
      includeJournal: data.includeJournal,
    });

    const exportId = crypto.randomUUID();
    const fileName = `${(client?.business_name ?? "Client").replace(/\W+/g, "_")}_Tally_${data.periodFrom}_${data.periodTo}.xml`;
    const path = `${firmId}/${data.clientId}/tally-exports/${exportId}.xml`;
    await admin.storage.from("invoices").upload(path, new TextEncoder().encode(xml), {
      contentType: "application/xml",
      upsert: false,
    });
    const { data: signed } = await admin.storage.from("invoices").createSignedUrl(path, 60 * 60);

    await admin.from("tally_exports").insert({
      id: exportId,
      ca_firm_id: firmId,
      client_id: data.clientId,
      export_type: "TALLY_XML",
      period_from: data.periodFrom,
      period_to: data.periodTo,
      file_url: path,
      file_name: fileName,
      record_count: (invs ?? []).length,
      generated_by: context.userId,
    });

    return { url: signed?.signedUrl ?? null, fileName, count: (invs ?? []).length };
  });

export const getImportDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ importId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getFirmIdForUser(context.userId);
    const { data: imp } = await admin.from("tally_imports").select("file_url,file_name").eq("id", data.importId).eq("ca_firm_id", firmId).maybeSingle();
    if (!imp?.file_url) throw new Error("File missing");
    const { data: signed } = await admin.storage.from("invoices").createSignedUrl(imp.file_url, 60 * 60);
    return { url: signed?.signedUrl ?? null, fileName: imp.file_name };
  });
