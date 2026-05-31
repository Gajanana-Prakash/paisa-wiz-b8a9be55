import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  totalGstPercent,
  type GstSearchResult,
  type HsnRow,
  type SacRow,
} from "./gst-library.utils";

export * from "./gst-library.utils";

function mapHsn(r: Record<string, unknown>): HsnRow {
  return {
    id: r.id as string,
    hsn_code: r.hsn_code as string,
    description: r.description as string,
    chapter: r.chapter as string,
    chapter_description: r.chapter_description as string,
    cgst_rate: Number(r.cgst_rate),
    sgst_rate: Number(r.sgst_rate),
    igst_rate: Number(r.igst_rate),
    cess_rate: r.cess_rate != null ? Number(r.cess_rate) : null,
    effective_from: r.effective_from as string,
    effective_to: (r.effective_to as string) ?? null,
    is_current: r.is_current as boolean,
    notes: (r.notes as string) ?? null,
    kind: "HSN",
  };
}

function mapSac(r: Record<string, unknown>): SacRow {
  return {
    id: r.id as string,
    sac_code: r.sac_code as string,
    service_description: r.service_description as string,
    cgst_rate: Number(r.cgst_rate),
    sgst_rate: Number(r.sgst_rate),
    igst_rate: Number(r.igst_rate),
    effective_from: r.effective_from as string,
    effective_to: (r.effective_to as string) ?? null,
    is_current: r.is_current as boolean,
    exemption_condition: (r.exemption_condition as string) ?? null,
    kind: "SAC",
  };
}

export async function searchGstLibrary(query: string, limit = 15): Promise<GstSearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const isCode = /^[\d.]+$/.test(q);
  const results: GstSearchResult[] = [];

  if (isCode) {
    const [{ data: hExact }, { data: sExact }] = await Promise.all([
      supabaseAdmin
        .from("hsn_master")
        .select("*")
        .eq("is_current", true)
        .ilike("hsn_code", `${q}%`)
        .order("hsn_code")
        .limit(limit),
      supabaseAdmin
        .from("sac_master")
        .select("*")
        .eq("is_current", true)
        .ilike("sac_code", `${q}%`)
        .order("sac_code")
        .limit(limit),
    ]);

    for (const r of hExact ?? []) {
      const row = mapHsn(r);
      results.push({ ...row, totalGst: totalGstPercent(row.cgst_rate, row.sgst_rate, row.igst_rate) });
    }
    for (const r of sExact ?? []) {
      const row = mapSac(r);
      results.push({ ...row, totalGst: totalGstPercent(row.cgst_rate, row.sgst_rate, row.igst_rate) });
    }
    return results.slice(0, limit);
  }

  const safe = q.replace(/[%_]/g, "").trim();
  const pattern = `%${safe}%`;
  const [{ data: hsnDesc }, { data: hsnCh }, { data: sac }] = await Promise.all([
    supabaseAdmin
      .from("hsn_master")
      .select("*")
      .eq("is_current", true)
      .ilike("description", pattern)
      .order("hsn_code")
      .limit(limit),
    supabaseAdmin
      .from("hsn_master")
      .select("*")
      .eq("is_current", true)
      .ilike("chapter_description", pattern)
      .order("hsn_code")
      .limit(limit),
    supabaseAdmin
      .from("sac_master")
      .select("*")
      .eq("is_current", true)
      .ilike("service_description", pattern)
      .order("sac_code")
      .limit(limit),
  ]);

  const hsnMap = new Map<string, Record<string, unknown>>();
  for (const r of [...(hsnDesc ?? []), ...(hsnCh ?? [])]) hsnMap.set(r.hsn_code as string, r);
  const hsn = [...hsnMap.values()];

  for (const r of hsn ?? []) {
    const row = mapHsn(r);
    results.push({ ...row, totalGst: totalGstPercent(row.cgst_rate, row.sgst_rate, row.igst_rate) });
  }
  for (const r of sac ?? []) {
    const row = mapSac(r);
    results.push({ ...row, totalGst: totalGstPercent(row.cgst_rate, row.sgst_rate, row.igst_rate) });
  }

  return results.slice(0, limit);
}

export async function lookupByCode(code: string) {
  const c = code.trim();
  if (!c) return null;

  const { data: hsn } = await supabaseAdmin
    .from("hsn_master")
    .select("*")
    .eq("is_current", true)
    .eq("hsn_code", c)
    .maybeSingle();

  if (hsn) {
    const row = mapHsn(hsn);
    return { ...row, totalGst: totalGstPercent(row.cgst_rate, row.sgst_rate, row.igst_rate) };
  }

  const { data: sac } = await supabaseAdmin
    .from("sac_master")
    .select("*")
    .eq("is_current", true)
    .eq("sac_code", c)
    .maybeSingle();

  if (sac) {
    const row = mapSac(sac);
    return { ...row, totalGst: totalGstPercent(row.cgst_rate, row.sgst_rate, row.igst_rate) };
  }

  const { data: hPrefix } = await supabaseAdmin
    .from("hsn_master")
    .select("*")
    .eq("is_current", true)
    .ilike("hsn_code", `${c}%`)
    .order("hsn_code")
    .limit(1)
    .maybeSingle();

  if (hPrefix) {
    const row = mapHsn(hPrefix);
    return { ...row, totalGst: totalGstPercent(row.cgst_rate, row.sgst_rate, row.igst_rate) };
  }

  return null;
}

export async function getHsnDetail(hsnCode: string) {
  const { data: rows } = await supabaseAdmin
    .from("hsn_master")
    .select("*")
    .eq("hsn_code", hsnCode)
    .order("is_current", { ascending: false })
    .order("effective_from", { ascending: false });

  if (!rows?.length) return null;

  const current = rows.find((r) => r.is_current) ?? rows[0];
  const history = rows.filter((r) => !r.is_current);
  const chapter = current.chapter;

  const { data: related } = await supabaseAdmin
    .from("hsn_master")
    .select("*")
    .eq("is_current", true)
    .eq("chapter", chapter)
    .neq("hsn_code", hsnCode)
    .order("hsn_code")
    .limit(6);

  return {
    current: mapHsn(current),
    history: history.map(mapHsn),
    related: (related ?? []).map(mapHsn),
  };
}

export async function getSacDetail(sacCode: string) {
  const { data: rows } = await supabaseAdmin
    .from("sac_master")
    .select("*")
    .eq("sac_code", sacCode)
    .order("is_current", { ascending: false });

  if (!rows?.length) return null;
  const current = rows.find((r) => r.is_current) ?? rows[0];
  return { current: mapSac(current), history: rows.filter((r) => !r.is_current).map(mapSac) };
}

export async function listGstNotifications(opts: {
  category?: string;
  limit?: number;
}) {
  let q = supabaseAdmin
    .from("gst_notifications")
    .select("*")
    .order("effective_date", { ascending: false })
    .limit(opts.limit ?? 30);

  if (opts.category && opts.category !== "ALL") {
    q = q.eq("category", opts.category);
  }

  const { data } = await q;
  return data ?? [];
}

export async function getGstNotification(id: string) {
  const { data } = await supabaseAdmin.from("gst_notifications").select("*").eq("id", id).single();
  return data;
}

export async function getClientsAffectedByNotification(caFirmId: string, hsnCodes: string[]) {
  if (!hsnCodes.length) return [];

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, business_name, gstin")
    .eq("ca_firm_id", caFirmId)
    .neq("status", "pending_invite");

  if (!clients?.length) return [];

  const clientIds = clients.map((c) => c.id);
  const matched = new Map<string, { id: string; business_name: string; gstin: string | null; hsnMatches: string[] }>();

  const { data: firmInvoices } = await supabaseAdmin
    .from("invoices")
    .select("id, client_id")
    .eq("ca_firm_id", caFirmId)
    .in("client_id", clientIds);

  const invToClient = new Map((firmInvoices ?? []).map((i) => [i.id, i.client_id]));
  const invIds = [...invToClient.keys()];

  for (const code of hsnCodes) {
    const prefix = code.replace(/\D/g, "").slice(0, 4);
    if (!prefix) continue;

    if (invIds.length) {
      const { data: items } = await supabaseAdmin
        .from("invoice_items")
        .select("hsn, invoice_id")
        .in("invoice_id", invIds)
        .not("hsn", "is", null)
        .ilike("hsn", `${prefix}%`);

      for (const it of items ?? []) {
        const cid = invToClient.get(it.invoice_id);
        if (!cid) continue;
        const cl = clients.find((c) => c.id === cid);
        if (!cl) continue;
        const prev = matched.get(cid) ?? { ...cl, hsnMatches: [] };
        if (!prev.hsnMatches.includes(code)) prev.hsnMatches.push(code);
        matched.set(cid, prev);
      }
    }

    const { data: services } = await supabaseAdmin
      .from("ca_services")
      .select("id")
      .eq("ca_firm_id", caFirmId)
      .ilike("hsn_sac_code", `${prefix}%`)
      .limit(1);

    if (services?.length) {
      for (const cl of clients) {
        const prev = matched.get(cl.id) ?? { ...cl, hsnMatches: [] };
        if (!prev.hsnMatches.includes(code)) prev.hsnMatches.push(code);
        matched.set(cl.id, prev);
      }
    }
  }

  return Array.from(matched.values());
}
