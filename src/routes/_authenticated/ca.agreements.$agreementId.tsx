import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  countersignAgreement,
  getAgreement,
  renewAgreement,
  sendAgreement,
  uploadAgreementAttachment,
} from "@/lib/agreements.functions";
import { AgreementStatusBadge } from "@/components/agreements/AgreementStatusBadge";
import { AgreementDocumentView } from "@/components/agreements/AgreementContentEditor";
import { AGREEMENT_TYPE_LABELS, FEE_FREQUENCY_LABELS } from "@/components/agreements/utils";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { mailtoLink, whatsappLink } from "@/components/billing/utils";

export const Route = createFileRoute("/_authenticated/ca/agreements/$agreementId")({
  component: AgreementDetailPage,
});

function AgreementDetailPage() {
  const { agreementId } = Route.useParams();
  const { role } = useTenant();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const load = useServerFn(getAgreement);
  const runRenew = useServerFn(renewAgreement);
  const runCountersign = useServerFn(countersignAgreement);
  const runSend = useServerFn(sendAgreement);
  const runUpload = useServerFn(uploadAgreementAttachment);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["agreement", agreementId],
    queryFn: () => load({ data: { id: agreementId } }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data?.agreement) return <div className="p-8">Agreement not found.</div>;

  const a = data.agreement as typeof data.agreement & { signed_download_url?: string | null };
  const client = a.clients as { business_name?: string; contact_email?: string; contact_phone?: string; contact_name?: string } | null;
  const downloadUrl = a.signed_download_url ?? null;
  const isOwner = role === "ca_owner";

  const handleRenew = async () => {
    try {
      const r = await runRenew({ data: { id: agreementId } });
      toast.success("Renewal draft created");
      window.location.href = `/ca/agreements/${r.id}`;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Renew failed");
    }
  };

  const handleCountersign = async () => {
    try {
      await runCountersign({ data: { id: agreementId } });
      toast.success("Countersigned");
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleResend = async () => {
    try {
      const r = await runSend({
        data: {
          id: agreementId,
          signerName: a.signer_name ?? client?.contact_name ?? "Client",
          signerEmail: a.signer_email ?? client?.contact_email ?? undefined,
          signerPhone: a.signer_phone ?? client?.contact_phone ?? undefined,
        },
      });
      const url = r.signUrl.startsWith("http") ? r.signUrl : `${window.location.origin}${r.signUrl}`;
      navigator.clipboard.writeText(url);
      toast.success("New signing link copied");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Resend failed");
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await runUpload({
        data: {
          agreementId,
          fileName: file.name,
          fileBase64: b64,
          mimeType: file.type,
        },
      });
      toast.success("Attachment uploaded");
      qc.invalidateQueries({ queryKey: ["agreement", agreementId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link to="/ca/agreements" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Agreements
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl font-semibold">{a.title}</h1>
            <AgreementStatusBadge status={a.status} />
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {client?.business_name} · {AGREEMENT_TYPE_LABELS[a.agreement_type] ?? a.agreement_type}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.status === "DRAFT" && (
            <Link to="/ca/agreements/$agreementId/edit" params={{ agreementId }}>
              <Button size="sm" variant="outline">Edit</Button>
            </Link>
          )}
          {["SENT", "VIEWED"].includes(a.status) && (
            <Button size="sm" variant="outline" onClick={handleResend}>Resend</Button>
          )}
          {downloadUrl && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => window.open(downloadUrl, "_blank")}>
              <Download className="size-3.5" /> Download signed copy
            </Button>
          )}
          {a.status === "SIGNED" && !a.ca_countersigned && isOwner && (
            <Button size="sm" variant="outline" className="gap-1" onClick={handleCountersign}>
              <ShieldCheck className="size-3.5" /> CA Countersign
            </Button>
          )}
          {["SIGNED", "EXPIRED"].includes(a.status) && (
            <Button size="sm" className="gap-1" onClick={handleRenew}>
              <RefreshCw className="size-3.5" /> Renew
            </Button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <MetaCard title="Dates">
          <Row label="Valid from" value={a.valid_from} />
          <Row label="Valid until" value={a.valid_until} />
          <Row label="Sent" value={a.sent_at ? new Date(a.sent_at).toLocaleString() : "—"} />
          <Row label="Signed" value={a.signed_at ? new Date(a.signed_at).toLocaleString() : "—"} />
        </MetaCard>
        <MetaCard title="Commercial">
          <Row label="Fee" value={a.fee_amount != null ? `₹${Number(a.fee_amount).toLocaleString("en-IN")}` : "—"} />
          <Row label="Frequency" value={a.fee_frequency ? FEE_FREQUENCY_LABELS[a.fee_frequency] : "—"} />
          <Row label="Services" value={(a.services_included ?? []).join(", ") || "—"} />
        </MetaCard>
      </div>

      {a.status === "SIGNED" && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-sm">
          <div className="font-semibold text-emerald-800 flex items-center gap-2">
            <ShieldCheck className="size-4" /> Signing certificate
          </div>
          <p className="mt-2 text-muted-foreground">
            This document was digitally signed by <strong>{a.signer_name}</strong> on{" "}
            {a.signed_at ? new Date(a.signed_at).toLocaleString() : "—"}
            {a.signing_ip ? ` from IP ${a.signing_ip}` : ""}.
            {a.otp_verified && " OTP verified."}
          </p>
          {a.ca_countersigned && (
            <p className="mt-1 text-emerald-700">CA countersigned on {new Date(a.ca_countersigned_at!).toLocaleString()}.</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border bg-card p-6 md:p-8">
        <AgreementDocumentView html={a.content_html} />
      </div>

      <div className="rounded-2xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Supporting documents</h3>
          <Button size="sm" variant="outline" className="gap-1" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" /> Upload
          </Button>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
        </div>
        {(data.attachments ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No attachments.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {data.attachments.map((att) => (
              <li key={att.id}>{att.file_name}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MetaCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}
