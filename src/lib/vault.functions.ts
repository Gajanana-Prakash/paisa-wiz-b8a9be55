import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertClientAccess, getUserFirmAndClientAccess } from "./vault.server";

const Category = z.enum(["KYC","GST","INCOME_TAX","AUDIT","BANKING","CORPORATE","INVOICES","NOTICES","AGREEMENTS","OTHER"]);
const FileType = z.enum(["PDF","IMAGE","EXCEL","WORD","OTHER"]);
const AccessLevel = z.enum(["CA_ONLY","CA_AND_CLIENT","CLIENT_ONLY"]);
const Source = z.enum(["MANUAL_UPLOAD","CLIENT_UPLOAD","ONBOARDING","AI_EXTRACTED","GENERATED"]);

export const listVaultDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    clientId: z.string().uuid(),
    category: Category.optional(),
    financialYear: z.string().optional(),
    fileType: FileType.optional(),
    search: z.string().max(200).optional(),
    includeAllVersions: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { caFirmId, isCAMember } = await assertClientAccess(context.userId, data.clientId);
    let q = supabaseAdmin.from("document_vault").select("*").eq("ca_firm_id", caFirmId).eq("client_id", data.clientId);
    if (!data.includeAllVersions) q = q.eq("is_latest_version", true);
    if (data.category) q = q.eq("document_category", data.category);
    if (data.financialYear) q = q.eq("financial_year", data.financialYear);
    if (data.fileType) q = q.eq("file_type", data.fileType);
    if (!isCAMember) q = q.in("access_level", ["CA_AND_CLIENT", "CLIENT_ONLY"]);
    q = q.order("created_at", { ascending: false }).limit(1000);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let list = rows ?? [];
    if (data.search?.trim()) {
      const s = data.search.trim().toLowerCase();
      list = list.filter((r: any) =>
        r.display_name?.toLowerCase().includes(s) ||
        r.document_subcategory?.toLowerCase().includes(s) ||
        r.description?.toLowerCase().includes(s) ||
        (r.tags ?? []).some((t: string) => t.toLowerCase().includes(s))
      );
    }
    return list;
  });

export const getVaultFolderTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { caFirmId, isCAMember } = await assertClientAccess(context.userId, data.clientId);
    let q = supabaseAdmin.from("document_vault")
      .select("document_category, financial_year, file_size_bytes")
      .eq("ca_firm_id", caFirmId).eq("client_id", data.clientId).eq("is_latest_version", true);
    if (!isCAMember) q = q.in("access_level", ["CA_AND_CLIENT", "CLIENT_ONLY"]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    const byFy: Record<string, Record<string, number>> = {};
    let total = 0;
    let totalBytes = 0;
    for (const r of rows ?? []) {
      const cat = (r as any).document_category as string;
      counts[cat] = (counts[cat] ?? 0) + 1;
      total++;
      totalBytes += Number((r as any).file_size_bytes ?? 0);
      const fy = (r as any).financial_year as string | null;
      if (fy && (cat === "GST" || cat === "INCOME_TAX")) {
        byFy[cat] = byFy[cat] ?? {};
        byFy[cat][fy] = (byFy[cat][fy] ?? 0) + 1;
      }
    }
    return { counts, byFy, total, totalBytes };
  });

export const uploadVaultDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    clientId: z.string().uuid(),
    filePath: z.string().min(1),
    fileName: z.string().min(1),
    displayName: z.string().min(1).max(255),
    fileType: FileType,
    fileSizeBytes: z.number().int().nonnegative(),
    category: Category,
    subcategory: z.string().max(120).nullable().optional(),
    financialYear: z.string().max(20).nullable().optional(),
    period: z.string().max(40).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    tags: z.array(z.string().max(40)).max(20).default([]),
    accessLevel: AccessLevel.default("CA_ONLY"),
    isKycDocument: z.boolean().default(false),
    source: Source.default("MANUAL_UPLOAD"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { caFirmId } = await assertClientAccess(context.userId, data.clientId);
    const { data: row, error } = await supabaseAdmin.from("document_vault").insert({
      ca_firm_id: caFirmId,
      client_id: data.clientId,
      uploaded_by: context.userId,
      file_path: data.filePath,
      file_name: data.fileName,
      display_name: data.displayName,
      file_type: data.fileType,
      file_size_bytes: data.fileSizeBytes,
      document_category: data.category,
      document_subcategory: data.subcategory ?? null,
      financial_year: data.financialYear ?? null,
      period: data.period ?? null,
      description: data.description ?? null,
      tags: data.tags,
      access_level: data.accessLevel,
      is_kyc_document: data.isKycDocument,
      source: data.source,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateVaultDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    displayName: z.string().min(1).max(255).optional(),
    category: Category.optional(),
    subcategory: z.string().max(120).nullable().optional(),
    financialYear: z.string().max(20).nullable().optional(),
    period: z.string().max(40).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
    accessLevel: AccessLevel.optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await supabaseAdmin.from("document_vault").select("client_id").eq("id", data.id).maybeSingle();
    if (!existing) throw new Error("Not found");
    const { isCAMember } = await assertClientAccess(context.userId, (existing as any).client_id);
    if (!isCAMember) throw new Error("CA members only");
    const patch: any = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.category !== undefined) patch.document_category = data.category;
    if (data.subcategory !== undefined) patch.document_subcategory = data.subcategory;
    if (data.financialYear !== undefined) patch.financial_year = data.financialYear;
    if (data.period !== undefined) patch.period = data.period;
    if (data.description !== undefined) patch.description = data.description;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.accessLevel !== undefined) patch.access_level = data.accessLevel;
    const { data: row, error } = await supabaseAdmin.from("document_vault").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteVaultDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), confirm: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc } = await supabaseAdmin.from("document_vault").select("*").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("Not found");
    const { isCAMember } = await assertClientAccess(context.userId, (doc as any).client_id);
    if (!isCAMember) throw new Error("CA members only");
    if ((doc as any).is_kyc_document && !data.confirm) throw new Error("KYC document requires explicit confirmation");
    await supabaseAdmin.storage.from("invoices").remove([(doc as any).file_path]).catch(() => {});
    const { error } = await supabaseAdmin.from("document_vault").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkMoveVaultDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(200), category: Category }).parse(d))
  .handler(async ({ data, context }) => {
    const access = await getUserFirmAndClientAccess(context.userId);
    if (!access.isCAMember || !access.caFirmId) throw new Error("CA members only");
    const { error } = await supabaseAdmin.from("document_vault")
      .update({ document_category: data.category })
      .in("id", data.ids).eq("ca_firm_id", access.caFirmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkSetAccessLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(200), accessLevel: AccessLevel }).parse(d))
  .handler(async ({ data, context }) => {
    const access = await getUserFirmAndClientAccess(context.userId);
    if (!access.isCAMember || !access.caFirmId) throw new Error("CA members only");
    const { error } = await supabaseAdmin.from("document_vault")
      .update({ access_level: data.accessLevel })
      .in("id", data.ids).eq("ca_firm_id", access.caFirmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replaceVaultDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    newFilePath: z.string().min(1),
    newFileName: z.string().min(1),
    newFileSizeBytes: z.number().int().nonnegative(),
    newFileType: FileType,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: parent } = await supabaseAdmin.from("document_vault").select("*").eq("id", data.id).maybeSingle();
    if (!parent) throw new Error("Not found");
    const p = parent as any;
    const { isCAMember } = await assertClientAccess(context.userId, p.client_id);
    if (!isCAMember) throw new Error("CA members only");
    await supabaseAdmin.from("document_vault").update({ is_latest_version: false }).eq("id", data.id);
    const { data: row, error } = await supabaseAdmin.from("document_vault").insert({
      ca_firm_id: p.ca_firm_id,
      client_id: p.client_id,
      uploaded_by: context.userId,
      file_path: data.newFilePath,
      file_name: data.newFileName,
      display_name: p.display_name,
      file_type: data.newFileType,
      file_size_bytes: data.newFileSizeBytes,
      document_category: p.document_category,
      document_subcategory: p.document_subcategory,
      financial_year: p.financial_year,
      period: p.period,
      description: p.description,
      tags: p.tags,
      access_level: p.access_level,
      is_kyc_document: p.is_kyc_document,
      source: "MANUAL_UPLOAD",
      version_number: (p.version_number ?? 1) + 1,
      parent_document_id: data.id,
      is_latest_version: true,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getVaultVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc } = await supabaseAdmin.from("document_vault").select("client_id, parent_document_id").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("Not found");
    await assertClientAccess(context.userId, (doc as any).client_id);
    // walk to root
    let rootId = data.id;
    const visited = new Set<string>();
    while (true) {
      if (visited.has(rootId)) break;
      visited.add(rootId);
      const { data: r } = await supabaseAdmin.from("document_vault").select("id, parent_document_id").eq("id", rootId).maybeSingle();
      const pid = (r as any)?.parent_document_id;
      if (!pid) break;
      rootId = pid;
    }
    // Fetch all descendants by traversing children
    const all: any[] = [];
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop()!;
      const { data: node } = await supabaseAdmin.from("document_vault").select("*").eq("id", cur).maybeSingle();
      if (node) all.push(node);
      const { data: kids } = await supabaseAdmin.from("document_vault").select("id").eq("parent_document_id", cur);
      for (const k of kids ?? []) stack.push((k as any).id);
    }
    return all.sort((a, b) => (b.version_number ?? 1) - (a.version_number ?? 1));
  });

export const getVaultSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    action: z.enum(["VIEWED", "DOWNLOADED"]).default("VIEWED"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc } = await supabaseAdmin.from("document_vault").select("*").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("Not found");
    const d = doc as any;
    const { caFirmId, isCAMember } = await assertClientAccess(context.userId, d.client_id);
    if (!isCAMember && d.access_level === "CA_ONLY") throw new Error("Access denied");
    const { data: signed, error } = await supabaseAdmin.storage.from("invoices").createSignedUrl(d.file_path, 300, {
      download: data.action === "DOWNLOADED" ? d.file_name : false,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("document_access_log").insert({
      ca_firm_id: caFirmId,
      document_id: data.id,
      accessed_by: context.userId,
      action: data.action,
    });
    return { url: signed.signedUrl, fileName: d.file_name, fileType: d.file_type };
  });

export const getVaultStorageOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await getUserFirmAndClientAccess(context.userId);
    if (!access.isCAMember || !access.caFirmId) throw new Error("CA members only");
    const { data: rows } = await supabaseAdmin.from("document_vault")
      .select("client_id, file_size_bytes, clients(business_name)")
      .eq("ca_firm_id", access.caFirmId);
    const byClient = new Map<string, { clientId: string; name: string; bytes: number; count: number }>();
    let total = 0;
    for (const r of rows ?? []) {
      const r2 = r as any;
      const bytes = Number(r2.file_size_bytes ?? 0);
      total += bytes;
      const k = r2.client_id;
      const entry = byClient.get(k) ?? { clientId: k, name: r2.clients?.business_name ?? "Unknown", bytes: 0, count: 0 };
      entry.bytes += bytes; entry.count += 1;
      byClient.set(k, entry);
    }
    return { totalBytes: total, byClient: Array.from(byClient.values()).sort((a, b) => b.bytes - a.bytes) };
  });

export const getRecentVaultUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(100).default(20) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const access = await getUserFirmAndClientAccess(context.userId);
    if (!access.isCAMember || !access.caFirmId) throw new Error("CA members only");
    const { data: rows, error } = await supabaseAdmin.from("document_vault")
      .select("*, clients(business_name)")
      .eq("ca_firm_id", access.caFirmId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const searchVaultGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const access = await getUserFirmAndClientAccess(context.userId);
    if (!access.isCAMember || !access.caFirmId) throw new Error("CA members only");
    const q = data.query.trim();
    const { data: rows, error } = await supabaseAdmin.from("document_vault")
      .select("id, display_name, document_category, document_subcategory, financial_year, file_type, created_at, client_id, clients(business_name)")
      .eq("ca_firm_id", access.caFirmId)
      .or(`display_name.ilike.%${q}%,document_subcategory.ilike.%${q}%,description.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listClientVaultDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid(), category: Category.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { caFirmId } = await assertClientAccess(context.userId, data.clientId);
    let q = supabaseAdmin.from("document_vault").select("*")
      .eq("ca_firm_id", caFirmId).eq("client_id", data.clientId)
      .eq("is_latest_version", true)
      .in("access_level", ["CA_AND_CLIENT", "CLIENT_ONLY"]);
    if (data.category) q = q.eq("document_category", data.category);
    q = q.order("created_at", { ascending: false });
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
