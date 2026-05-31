import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess, isCAOwner } from "./timetracking.server";
import { notifyClientPortal } from "./client-notifications.server";
import {
  addMonths,
  buildSignedDocumentHtml,
  genOtp,
  genSignToken,
  getSignedDocumentUrl,
  hashOtp,
  mergeAgreementContent,
  processExpiryReminders,
  uploadSignedDocument,
  type MergeContext,
} from "./agreements.server";

const AgreementType = z.enum([
  "ENGAGEMENT_LETTER", "SERVICE_AGREEMENT", "NDA", "AUTHORIZATION_LETTER", "CUSTOM",
]);
const FeeFrequency = z.enum(["ONE_TIME", "MONTHLY", "QUARTERLY", "ANNUAL"]);
const AgreementStatus = z.enum(["DRAFT", "SENT", "VIEWED", "SIGNED", "EXPIRED", "CANCELLED"]);

async function assertClientInFirm(clientId: string, firmId: string) {
  const { data } = await supabaseAdmin
    .from("clients")
    .select("id, business_name, contact_name, contact_email, contact_phone")
    .eq("id", clientId)
    .eq("ca_firm_id", firmId)
    .maybeSingle();
  if (!data) throw new Error("Client not found");
  return data;
}

async function buildMergeContext(
  firmId: string,
  clientId: string,
  services: string[],
  feeAmount: number | null,
  feeFrequency: string | null,
  validFrom: string,
  validUntil: string,
): Promise<MergeContext> {
  const client = await assertClientInFirm(clientId, firmId);
  const { data: firm } = await supabaseAdmin.from("ca_firms").select("name").eq("id", firmId).single();
  return {
    clientName: client.business_name,
    firmName: firm?.name ?? "CA Firm",
    servicesList: services,
    feeAmount,
    feeFrequency,
    validFrom,
    validUntil,
  };
}

/* ========== TEMPLATES ========== */

export const listAgreementTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data, error } = await supabaseAdmin
      .from("agreement_templates")
      .select("*")
      .or(`is_system.eq.true,ca_firm_id.eq.${firmId}`)
      .order("is_system", { ascending: false })
      .order("template_name");
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

export const upsertAgreementTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      templateName: z.string().min(1).max(200),
      agreementType: AgreementType,
      contentHtml: z.string().min(1).max(100_000),
      servicesCovered: z.array(z.string()).optional(),
      validityMonths: z.number().int().min(1).max(120).optional(),
      isDefault: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA owner can manage templates");
    const row = {
      ca_firm_id: firmId,
      template_name: data.templateName,
      agreement_type: data.agreementType,
      content_html: data.contentHtml,
      services_covered: data.servicesCovered ?? [],
      validity_months: data.validityMonths ?? 12,
      is_default: data.isDefault ?? false,
      is_system: false,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("agreement_templates").update(row).eq("id", data.id).eq("ca_firm_id", firmId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin.from("agreement_templates").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteAgreementTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA owner can delete templates");
    const { error } = await supabaseAdmin
      .from("agreement_templates")
      .delete()
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .eq("is_system", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ========== AGREEMENTS CRUD ========== */

export const listAgreements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid().optional(),
      status: AgreementStatus.optional(),
      agreementType: AgreementType.optional(),
      search: z.string().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    await processExpiryReminders(firmId);

    let q = supabaseAdmin
      .from("client_agreements")
      .select("*, clients(business_name)")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false });

    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.status) q = q.eq("status", data.status);
    if (data.agreementType) q = q.eq("agreement_type", data.agreementType);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let list = rows ?? [];
    if (data.search?.trim()) {
      const s = data.search.trim().toLowerCase();
      list = list.filter((r) =>
        r.title.toLowerCase().includes(s) ||
        ((r.clients as { business_name?: string } | null)?.business_name ?? "").toLowerCase().includes(s),
      );
    }
    return { agreements: list };
  });

export const getAgreementStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertFirmAccess(context.userId);
    await processExpiryReminders(firmId);

    const { data } = await supabaseAdmin
      .from("client_agreements")
      .select("status, valid_until")
      .eq("ca_firm_id", firmId);

    const today = new Date();
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);

    const rows = data ?? [];
    return {
      active: rows.filter((r) => r.status === "SIGNED").length,
      pendingSignature: rows.filter((r) => ["SENT", "VIEWED"].includes(r.status)).length,
      expiringSoon: rows.filter((r) => {
        if (r.status !== "SIGNED") return false;
        const until = new Date(r.valid_until);
        return until >= today && until <= in30;
      }).length,
      expired: rows.filter((r) => r.status === "EXPIRED").length,
    };
  });

export const getAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: agreement, error } = await supabaseAdmin
      .from("client_agreements")
      .select("*, clients(business_name, contact_name, contact_email, contact_phone)")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .single();
    if (error || !agreement) throw new Error("Agreement not found");

    const { data: attachments } = await supabaseAdmin
      .from("agreement_attachments")
      .select("*")
      .eq("agreement_id", data.id)
      .order("created_at", { ascending: false });

    const { data: firm } = await supabaseAdmin.from("ca_firms").select("name, logo_url").eq("id", firmId).single();

    let signedDownloadUrl: string | null = null;
    if (agreement.signed_pdf_url) {
      try {
        signedDownloadUrl = await getSignedDocumentUrl(agreement.signed_pdf_url);
      } catch {
        signedDownloadUrl = null;
      }
    }

    return { agreement: { ...agreement, signed_download_url: signedDownloadUrl }, attachments: attachments ?? [], firm };
  });

export const createAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      templateId: z.string().uuid().optional(),
      clientId: z.string().uuid(),
      agreementType: AgreementType,
      title: z.string().min(1).max(300),
      contentHtml: z.string().min(1).max(100_000).optional(),
      servicesIncluded: z.array(z.string()).optional(),
      feeAmount: z.number().nullable().optional(),
      feeFrequency: FeeFrequency.nullable().optional(),
      validFrom: z.string(),
      validUntil: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    await assertClientInFirm(data.clientId, firmId);

    let contentHtml = data.contentHtml ?? "";
    let agreementType = data.agreementType;
    const services = data.servicesIncluded ?? [];

    if (data.templateId && !contentHtml) {
      const { data: tpl } = await supabaseAdmin
        .from("agreement_templates")
        .select("*")
        .eq("id", data.templateId)
        .maybeSingle();
      if (tpl) {
        contentHtml = tpl.content_html;
        agreementType = tpl.agreement_type as typeof agreementType;
      }
    }

    const ctx = await buildMergeContext(
      firmId, data.clientId, services,
      data.feeAmount ?? null, data.feeFrequency ?? null,
      data.validFrom, data.validUntil,
    );
    const merged = mergeAgreementContent(contentHtml, ctx);

    const { data: ins, error } = await supabaseAdmin
      .from("client_agreements")
      .insert({
        ca_firm_id: firmId,
        client_id: data.clientId,
        template_id: data.templateId ?? null,
        agreement_type: agreementType,
        title: data.title,
        content_html: merged,
        services_included: services,
        fee_amount: data.feeAmount ?? null,
        fee_frequency: data.feeFrequency ?? null,
        valid_from: data.validFrom,
        valid_until: data.validUntil,
        status: "DRAFT",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const updateAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(300).optional(),
      contentHtml: z.string().min(1).max(100_000).optional(),
      servicesIncluded: z.array(z.string()).optional(),
      feeAmount: z.number().nullable().optional(),
      feeFrequency: FeeFrequency.nullable().optional(),
      validFrom: z.string().optional(),
      validUntil: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: existing } = await supabaseAdmin
      .from("client_agreements")
      .select("*")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .single();
    if (!existing) throw new Error("Agreement not found");
    if (existing.status !== "DRAFT") throw new Error("Only draft agreements can be edited");

    const patch: Record<string, unknown> = {};
    if (data.title) patch.title = data.title;
    if (data.contentHtml) patch.content_html = data.contentHtml;
    if (data.servicesIncluded) patch.services_included = data.servicesIncluded;
    if (data.feeAmount !== undefined) patch.fee_amount = data.feeAmount;
    if (data.feeFrequency !== undefined) patch.fee_frequency = data.feeFrequency;
    if (data.validFrom) patch.valid_from = data.validFrom;
    if (data.validUntil) patch.valid_until = data.validUntil;

    const { error } = await supabaseAdmin.from("client_agreements").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      signerName: z.string().min(1).max(120),
      signerEmail: z.string().email().max(255).optional().or(z.literal("")),
      signerPhone: z.string().max(20).optional(),
      customMessage: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: agreement } = await supabaseAdmin
      .from("client_agreements")
      .select("*")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .single();
    if (!agreement) throw new Error("Agreement not found");
    if (!["DRAFT", "SENT"].includes(agreement.status)) throw new Error("Agreement cannot be sent in current status");

    const token = genSignToken();
    const tokenExpires = new Date();
    tokenExpires.setDate(tokenExpires.getDate() + 30);

    await supabaseAdmin.from("client_agreement_signing").upsert({
      agreement_id: data.id,
      sign_token: token,
      token_expires_at: tokenExpires.toISOString(),
      otp_hash: null,
      otp_expires_at: null,
    }, { onConflict: "agreement_id" });

    const { error } = await supabaseAdmin.from("client_agreements").update({
      status: "SENT",
      sent_at: new Date().toISOString(),
      signer_name: data.signerName,
      signer_email: data.signerEmail || null,
      signer_phone: data.signerPhone || null,
      custom_message: data.customMessage ?? null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);

    await notifyClientPortal({
      caFirmId: firmId,
      clientId: agreement.client_id,
      type: "agreement",
      title: "Agreement ready to sign",
      body: agreement.title ?? "Please review and sign your service agreement.",
      link: "/client/agreements",
    });

    const signUrl = `${process.env.APP_URL ?? ""}/sign/${token}`.replace(/\/\/sign/, "/sign") ||
      `/sign/${token}`;

    return { ok: true, signToken: token, signUrl };
  });

export const renewAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: src } = await supabaseAdmin
      .from("client_agreements")
      .select("*")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .single();
    if (!src) throw new Error("Agreement not found");

    const validFrom = new Date().toISOString().slice(0, 10);
    const validUntil = addMonths(validFrom, 12);

    const ctx = await buildMergeContext(
      firmId, src.client_id, src.services_included ?? [],
      src.fee_amount != null ? Number(src.fee_amount) : null,
      src.fee_frequency, validFrom, validUntil,
    );
    const merged = mergeAgreementContent(src.content_html, ctx);

    const { data: ins, error } = await supabaseAdmin
      .from("client_agreements")
      .insert({
        ca_firm_id: firmId,
        client_id: src.client_id,
        template_id: src.template_id,
        agreement_type: src.agreement_type,
        title: src.title.replace(/\d{4}-\d{2}/, validFrom.slice(0, 7)) + " (Renewal)",
        content_html: merged,
        services_included: src.services_included,
        fee_amount: src.fee_amount,
        fee_frequency: src.fee_frequency,
        valid_from: validFrom,
        valid_until: validUntil,
        status: "DRAFT",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const countersignAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    if (!(await isCAOwner(context.userId, firmId))) throw new Error("Only the CA owner can countersign");
    const { error } = await supabaseAdmin.from("client_agreements").update({
      ca_countersigned: true,
      ca_countersigned_at: new Date().toISOString(),
    }).eq("id", data.id).eq("ca_firm_id", firmId).eq("status", "SIGNED");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uploadAgreementAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      agreementId: z.string().uuid(),
      fileName: z.string().min(1).max(255),
      fileBase64: z.string().min(1),
      mimeType: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const { data: agreement } = await supabaseAdmin
      .from("client_agreements")
      .select("client_id")
      .eq("id", data.agreementId)
      .eq("ca_firm_id", firmId)
      .single();
    if (!agreement) throw new Error("Agreement not found");

    const buf = Buffer.from(data.fileBase64, "base64");
    const path = `${firmId}/${agreement.client_id}/${data.agreementId}/attachments/${Date.now()}-${data.fileName}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("agreement-documents")
      .upload(path, buf, { contentType: data.mimeType ?? "application/octet-stream" });
    if (upErr) throw new Error(upErr.message);

    const { error } = await supabaseAdmin.from("agreement_attachments").insert({
      agreement_id: data.agreementId,
      ca_firm_id: firmId,
      file_name: data.fileName,
      file_path: path,
      file_size_bytes: buf.length,
      uploaded_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ========== CLIENT PORTAL ========== */

export const listClientAgreements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("client_id")
      .eq("user_id", context.userId)
      .in("role", ["client_owner", "client_employee"]);
    const clientIds = (roles ?? []).map((r) => r.client_id).filter(Boolean) as string[];
    if (!clientIds.length) return { agreements: [] };

    const { data, error } = await supabaseAdmin
      .from("client_agreements")
      .select("id, title, agreement_type, status, sent_at, signed_at, valid_until, signed_pdf_url")
      .in("client_id", clientIds)
      .neq("status", "DRAFT")
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (data ?? []).map((a) => a.id);
    const { data: signing } = ids.length
      ? await supabaseAdmin.from("client_agreement_signing").select("agreement_id, sign_token").in("agreement_id", ids)
      : { data: [] };

    const tokenMap = new Map((signing ?? []).map((s) => [s.agreement_id, s.sign_token]));

    const withUrls = await Promise.all(
      (data ?? []).map(async (a) => {
        let downloadUrl: string | null = null;
        if (a.signed_pdf_url) {
          try {
            downloadUrl = await getSignedDocumentUrl(a.signed_pdf_url);
          } catch {
            downloadUrl = null;
          }
        }
        return {
          ...a,
          signed_pdf_url: downloadUrl,
          signToken: ["SENT", "VIEWED"].includes(a.status) ? tokenMap.get(a.id) ?? null : null,
        };
      }),
    );

    return { agreements: withUrls };
  });

/* ========== PUBLIC SIGNING ========== */

export const getAgreementForSigning = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data }) => {
    const { data: signing } = await supabaseAdmin
      .from("client_agreement_signing")
      .select("agreement_id, token_expires_at")
      .eq("sign_token", data.token)
      .maybeSingle();

    if (!signing) return { ok: false, reason: "not_found" as const };
    if (new Date(signing.token_expires_at) < new Date()) return { ok: false, reason: "expired" as const };

    const { data: agreement } = await supabaseAdmin
      .from("client_agreements")
      .select("*, clients(business_name)")
      .eq("id", signing.agreement_id)
      .single();

    if (!agreement) return { ok: false, reason: "not_found" as const };
    if (agreement.status === "SIGNED") return { ok: false, reason: "already_signed" as const };
    if (agreement.status === "CANCELLED" || agreement.status === "EXPIRED") {
      return { ok: false, reason: "invalid_status" as const };
    }

    if (agreement.status === "SENT") {
      await supabaseAdmin.from("client_agreements").update({
        status: "VIEWED",
        viewed_at: new Date().toISOString(),
      }).eq("id", agreement.id);
    }

    const { data: firm } = await supabaseAdmin
      .from("ca_firms")
      .select("name, logo_url, primary_color")
      .eq("id", agreement.ca_firm_id)
      .single();

    return {
      ok: true,
      agreement: {
        id: agreement.id,
        title: agreement.title,
        contentHtml: agreement.content_html,
        signerName: agreement.signer_name,
        signerPhone: agreement.signer_phone,
        clientName: (agreement.clients as { business_name?: string } | null)?.business_name,
      },
      firm,
    };
  });

export const requestSigningOtp = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data }) => {
    const { data: signing } = await supabaseAdmin
      .from("client_agreement_signing")
      .select("agreement_id, token_expires_at")
      .eq("sign_token", data.token)
      .maybeSingle();
    if (!signing || new Date(signing.token_expires_at) < new Date()) {
      throw new Error("Invalid or expired signing link");
    }

    const { data: agreement } = await supabaseAdmin
      .from("client_agreements")
      .select("signer_phone, ca_firm_id, title")
      .eq("id", signing.agreement_id)
      .single();
    if (!agreement) throw new Error("Agreement not found");

    const otp = genOtp();
    const otpHash = await hashOtp(otp);
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 10);

    await supabaseAdmin.from("client_agreement_signing").update({
      otp_hash: otpHash,
      otp_expires_at: expires.toISOString(),
    }).eq("agreement_id", signing.agreement_id);

    // MVP: no SMS provider — notify CA firm in-app; return demo OTP for signing flow
    await supabaseAdmin.from("ca_notifications").insert({
      ca_firm_id: agreement.ca_firm_id,
      type: "agreement_otp",
      title: "Client requested signing OTP",
      body: `OTP generated for "${agreement.title}". In production this is sent via SMS to ${agreement.signer_phone ?? "client phone"}.`,
    });

    return {
      ok: true,
      phoneMasked: agreement.signer_phone ? `****${agreement.signer_phone.slice(-4)}` : null,
      demoOtp: otp,
    };
  });

export const confirmAgreementSignature = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      token: z.string().min(16),
      otp: z.string().length(6),
      signerName: z.string().min(1).max(120),
      designation: z.string().max(120).optional(),
      signingIp: z.string().max(45).optional(),
      signingDevice: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: signing } = await supabaseAdmin
      .from("client_agreement_signing")
      .select("*")
      .eq("sign_token", data.token)
      .maybeSingle();
    if (!signing || new Date(signing.token_expires_at) < new Date()) {
      throw new Error("Invalid or expired signing link");
    }
    if (!signing.otp_hash || !signing.otp_expires_at || new Date(signing.otp_expires_at) < new Date()) {
      throw new Error("OTP expired. Request a new code.");
    }

    const otpHash = await hashOtp(data.otp);
    if (otpHash !== signing.otp_hash) throw new Error("Invalid OTP");

    const { data: agreement } = await supabaseAdmin
      .from("client_agreements")
      .select("*")
      .eq("id", signing.agreement_id)
      .single();
    if (!agreement || agreement.status === "SIGNED") throw new Error("Agreement not available for signing");

    const signedAt = new Date().toISOString();
    const { data: firm } = await supabaseAdmin.from("ca_firms").select("name").eq("id", agreement.ca_firm_id).single();

    const signerLabel = data.designation
      ? `${data.signerName} (${data.designation})`
      : data.signerName;

    const signedHtml = buildSignedDocumentHtml({
      contentHtml: agreement.content_html,
      signerName: signerLabel,
      signedAt,
      firmName: firm?.name ?? "CA Firm",
      title: agreement.title,
    });

    let signedPdfPath: string | null = null;
    try {
      signedPdfPath = await uploadSignedDocument(
        agreement.ca_firm_id,
        agreement.client_id,
        agreement.id,
        signedHtml,
      );
    } catch {
      /* storage optional */
    }

    await supabaseAdmin.from("client_agreements").update({
      status: "SIGNED",
      signed_at: signedAt,
      signer_name: data.signerName,
      otp_verified: true,
      signing_ip: data.signingIp ?? null,
      signing_device: data.signingDevice ?? null,
      signed_pdf_url: signedPdfPath,
    }).eq("id", agreement.id);

    await supabaseAdmin.from("ca_notifications").insert({
      ca_firm_id: agreement.ca_firm_id,
      type: "agreement_signed",
      title: "Agreement signed",
      body: `${data.signerName} signed "${agreement.title}".`,
      link: `/ca/agreements/${agreement.id}`,
    });

    let signedPdfUrl: string | null = null;
    if (signedPdfPath) {
      try {
        signedPdfUrl = await getSignedDocumentUrl(signedPdfPath);
      } catch {
        signedPdfUrl = null;
      }
    }

    return { ok: true, signedPdfUrl, signedHtml };
  });

export const previewMergedAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid(),
      contentHtml: z.string(),
      servicesIncluded: z.array(z.string()),
      feeAmount: z.number().nullable().optional(),
      feeFrequency: FeeFrequency.nullable().optional(),
      validFrom: z.string(),
      validUntil: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const ctx = await buildMergeContext(
      firmId, data.clientId, data.servicesIncluded,
      data.feeAmount ?? null, data.feeFrequency ?? null,
      data.validFrom, data.validUntil,
    );
    return { html: mergeAgreementContent(data.contentHtml, ctx) };
  });
