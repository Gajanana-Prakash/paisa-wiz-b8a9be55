import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const MERGE_TAGS = [
  "{CLIENT_NAME}",
  "{CA_FIRM_NAME}",
  "{SERVICES_LIST}",
  "{FEE_AMOUNT}",
  "{FEE_FREQUENCY}",
  "{VALID_FROM}",
  "{VALID_UNTIL}",
  "{DATE}",
] as const;

export const SERVICE_OPTIONS = [
  "GST Filing",
  "TDS Returns",
  "ITR Filing",
  "Bookkeeping",
  "Audit",
  "MCA Compliance",
  "Others",
] as const;

export type MergeContext = {
  clientName: string;
  firmName: string;
  servicesList: string[];
  feeAmount: number | null;
  feeFrequency: string | null;
  validFrom: string;
  validUntil: string;
};

export function genSignToken(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function genOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hashOtp(otp: string): Promise<string> {
  const data = new TextEncoder().encode(otp);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatFee(amount: number | null, frequency: string | null): string {
  if (amount == null) return "As mutually agreed";
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
  const freqLabel: Record<string, string> = {
    ONE_TIME: "One-time",
    MONTHLY: "Monthly",
    QUARTERLY: "Quarterly",
    ANNUAL: "Annual",
  };
  return `${inr}${frequency ? ` (${freqLabel[frequency] ?? frequency})` : ""}`;
}

export function mergeAgreementContent(template: string, ctx: MergeContext): string {
  const services = ctx.servicesList.length ? ctx.servicesList.join(", ") : "As specified";
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  return template
    .replaceAll("{CLIENT_NAME}", ctx.clientName)
    .replaceAll("{CA_FIRM_NAME}", ctx.firmName)
    .replaceAll("{SERVICES_LIST}", services)
    .replaceAll("{FEE_AMOUNT}", formatFee(ctx.feeAmount, ctx.feeFrequency))
    .replaceAll("{FEE_FREQUENCY}", ctx.feeFrequency?.replaceAll("_", " ") ?? "—")
    .replaceAll("{VALID_FROM}", ctx.validFrom)
    .replaceAll("{VALID_UNTIL}", ctx.validUntil)
    .replaceAll("{DATE}", today);
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function buildSignedDocumentHtml(opts: {
  contentHtml: string;
  signerName: string;
  signedAt: string;
  firmName: string;
  title: string;
}): string {
  const signedLabel = new Date(opts.signedAt).toLocaleString("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
  });
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${opts.title}</title>
<style>
  @page { margin: 2cm 2cm 3cm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.65; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; }
  h2 { font-size: 1.15rem; margin-top: 1.5rem; }
  .watermark {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: linear-gradient(90deg, #1e40af, #2563eb);
    color: white; text-align: center; padding: 8px 16px;
    font-size: 11px; letter-spacing: 0.12em; font-family: system-ui, sans-serif;
  }
  .sig-footer { margin-top: 48px; padding-top: 16px; border-top: 2px solid #2563eb; font-size: 13px; color: #374151; }
  @media print { .watermark { position: fixed; } }
</style></head><body>
${opts.contentHtml}
<div class="sig-footer">
  <strong>Digitally signed by ${opts.signerName}</strong> on ${signedLabel}<br/>
  ${opts.firmName} · Agreement: ${opts.title}
</div>
<div class="watermark">DIGITALLY SIGNED · OTP VERIFIED · LEGALLY BINDING</div>
</body></html>`;
}

export async function uploadSignedDocument(
  firmId: string,
  clientId: string,
  agreementId: string,
  html: string,
): Promise<string> {
  const path = `${firmId}/${clientId}/${agreementId}/signed.html`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const { error } = await supabaseAdmin.storage
    .from("agreement-documents")
    .upload(path, blob, { upsert: true, contentType: "text/html;charset=utf-8" });
  if (error) throw new Error(error.message);
  return path;
}

export async function getSignedDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from("agreement-documents")
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not create download URL");
  return data.signedUrl;
}

export async function processExpiryReminders(firmId: string): Promise<void> {
  await supabaseAdmin
    .from("client_agreements")
    .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
    .in("status", ["SIGNED", "SENT", "VIEWED"])
    .lt("valid_until", new Date().toISOString().slice(0, 10));

  const today = new Date();
  const in60 = new Date(today);
  in60.setDate(in60.getDate() + 60);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const { data: agreements } = await supabaseAdmin
    .from("client_agreements")
    .select("id, title, valid_until, client_id, clients(business_name)")
    .eq("ca_firm_id", firmId)
    .eq("status", "SIGNED")
    .gte("valid_until", fmt(today))
    .lte("valid_until", fmt(in60));

  for (const a of agreements ?? []) {
    const daysLeft = Math.ceil(
      (new Date(a.valid_until).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    const bucket = daysLeft <= 30 ? 30 : 60;
    const clientName = (a.clients as { business_name?: string } | null)?.business_name ?? "Client";

    const { data: existing } = await supabaseAdmin
      .from("agreement_expiry_notifications")
      .select("id")
      .eq("agreement_id", a.id)
      .eq("days_before", bucket)
      .maybeSingle();

    if (existing) continue;

    await supabaseAdmin.from("agreement_expiry_notifications").insert({
      agreement_id: a.id,
      ca_firm_id: firmId,
      days_before: bucket,
    });

    const urgency = bucket === 30 ? "⚠️ " : "";
    await supabaseAdmin.from("ca_notifications").insert({
      ca_firm_id: firmId,
      user_id: null,
      type: "agreement_expiry",
      title: `${urgency}Agreement expiring in ${daysLeft} days`,
      body: `"${a.title}" with ${clientName} expires on ${a.valid_until}. Consider renewal.`,
      link: `/ca/agreements/${a.id}`,
    });
  }
}
