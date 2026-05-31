import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createAgreement,
  listAgreementTemplates,
  previewMergedAgreement,
  sendAgreement,
} from "@/lib/agreements.functions";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AgreementContentEditor, AgreementDocumentView } from "@/components/agreements/AgreementContentEditor";
import { TEMPLATE_CARDS, FEE_FREQUENCY_LABELS } from "@/components/agreements/utils";
import { SERVICE_OPTIONS, addMonths } from "@/lib/agreements.server";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { toast } from "sonner";
import { mailtoLink, whatsappLink } from "@/components/billing/utils";

export const Route = createFileRoute("/_authenticated/ca/agreements/new")({
  validateSearch: (s) => ({ clientId: (s as { clientId?: string }).clientId }),
  component: NewAgreementPage,
});

function NewAgreementPage() {
  const { clientId: defaultClientId } = Route.useSearch();
  const { firm } = useTenant();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [contentHtml, setContentHtml] = useState("");
  const [agreementType, setAgreementType] = useState<string>("SERVICE_AGREEMENT");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [title, setTitle] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [feeAmount, setFeeAmount] = useState("");
  const [feeFrequency, setFeeFrequency] = useState<string>("MONTHLY");
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState(addMonths(new Date().toISOString().slice(0, 10), 12));
  const [previewHtml, setPreviewHtml] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [clients, setClients] = useState<Array<{ id: string; business_name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);

  const loadTemplates = useServerFn(listAgreementTemplates);
  const runPreview = useServerFn(previewMergedAgreement);
  const runCreate = useServerFn(createAgreement);
  const runSend = useServerFn(sendAgreement);

  const { data: tplData } = useQuery({
    queryKey: ["agreement-templates"],
    queryFn: () => loadTemplates({ data: undefined as never }),
  });

  useEffect(() => {
    if (!firm?.id) return;
    supabase.from("clients").select("id, business_name, contact_name, contact_email, contact_phone")
      .eq("ca_firm_id", firm.id).order("business_name")
      .then(({ data }) => setClients(data ?? []));
  }, [firm?.id]);

  useEffect(() => {
    if (!clientId) return;
    const c = clients.find((x) => x.id === clientId);
    if (c) {
      setSignerName(c.contact_name ?? "");
      setSignerEmail(c.contact_email ?? "");
      setSignerPhone(c.contact_phone ?? "");
      if (!title) setTitle(`${c.business_name} — Service Agreement`);
    }
  }, [clientId, clients, title]);

  const templates = tplData?.templates ?? [];

  const pickTemplate = (idx: number) => {
    setSelectedCard(idx);
    const card = TEMPLATE_CARDS[idx];
    setAgreementType(card.type);
    const tpl = templates.find((t) =>
      card.name === "Custom" ? false : t.template_name === card.name || t.agreement_type === card.type,
    );
    if (tpl) {
      setTemplateId(tpl.id);
      setContentHtml(tpl.content_html);
      if (tpl.services_covered?.length) setServices([...tpl.services_covered]);
    } else if (card.name === "Custom") {
      setTemplateId(null);
      setContentHtml("<h1>Custom Agreement</h1>\n<p>Between {CA_FIRM_NAME} and {CLIENT_NAME}.</p>\n<p>{SERVICES_LIST}</p>");
    }
  };

  const toggleService = (s: string) => {
    setServices((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const handlePreview = async () => {
    if (!clientId) { toast.error("Select a client first"); return; }
    try {
      const r = await runPreview({
        data: {
          clientId,
          contentHtml,
          servicesIncluded: services,
          feeAmount: feeAmount ? Number(feeAmount) : null,
          feeFrequency: feeFrequency as never,
          validFrom,
          validUntil,
        },
      });
      setPreviewHtml(r.html);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  };

  const saveDraft = async () => {
    if (!clientId || !title.trim()) { toast.error("Client and title are required"); return; }
    setBusy(true);
    try {
      const r = await runCreate({
        data: {
          templateId: templateId ?? undefined,
          clientId,
          agreementType: agreementType as never,
          title: title.trim(),
          contentHtml,
          servicesIncluded: services,
          feeAmount: feeAmount ? Number(feeAmount) : null,
          feeFrequency: feeFrequency as never,
          validFrom,
          validUntil,
        },
      });
      setDraftId(r.id);
      return r.id;
    } finally {
      setBusy(false);
    }
  };

  const goStep3 = async () => {
    const id = draftId ?? await saveDraft();
    if (!id) return;
    setDraftId(id);
    await handlePreview();
    setStep(3);
  };

  const handleSend = async () => {
    if (!signerName.trim()) { toast.error("Signatory name is required"); return; }
    setBusy(true);
    try {
      let id = draftId;
      if (!id) id = await saveDraft() ?? null;
      if (!id) return;
      const r = await runSend({
        data: {
          id,
          signerName: signerName.trim(),
          signerEmail: signerEmail || undefined,
          signerPhone: signerPhone || undefined,
          customMessage: customMessage || undefined,
        },
      });
      const url = r.signUrl.startsWith("http") ? r.signUrl : `${window.location.origin}${r.signUrl}`;
      setSignUrl(url);
      toast.success("Agreement sent for signature");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const sendMsg = useMemo(() => {
    if (!signUrl) return "";
    return `${customMessage ? customMessage + "\n\n" : ""}Please review and sign your agreement:\n${signUrl}`;
  }, [signUrl, customMessage]);

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link to="/ca/agreements" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to agreements
      </Link>
      <h1 className="font-display text-3xl font-semibold">New Agreement</h1>

      <div className="flex gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`px-3 py-1 rounded-full ${step === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            Step {s}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {TEMPLATE_CARDS.map((card, idx) => (
            <button
              key={card.name}
              type="button"
              onClick={() => pickTemplate(idx)}
              className={`text-left rounded-2xl border p-5 transition hover:border-primary/50 ${selectedCard === idx ? "border-primary ring-2 ring-primary/20" : ""}`}
            >
              <div className="font-semibold">{card.name}</div>
              <p className="text-sm text-muted-foreground mt-1">{card.description}</p>
              <p className="text-xs text-muted-foreground mt-2">Use case: {card.useCase}</p>
              {card.readMins > 0 && <p className="text-xs mt-1">~{card.readMins} min read</p>}
            </button>
          ))}
          <div className="sm:col-span-2 flex justify-end">
            <Button disabled={selectedCard === null} onClick={() => setStep(2)} className="gap-1">
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Agreement title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Services included</Label>
            <div className="flex flex-wrap gap-3">
              {SERVICE_OPTIONS.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={services.includes(s)} onCheckedChange={() => toggleService(s)} />
                  {s}
                </label>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Fee amount (₹)</Label>
              <Input type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={feeFrequency} onValueChange={setFeeFrequency}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FEE_FREQUENCY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Valid from</Label>
                <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Valid until</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>

          <AgreementContentEditor
            value={contentHtml}
            onChange={setContentHtml}
            previewHtml={previewHtml}
            onPreview={handlePreview}
          />

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={goStep3} disabled={busy} className="gap-1">
              Continue to send <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          {previewHtml && (
            <div className="rounded-2xl border p-6 bg-muted/20 max-h-64 overflow-auto">
              <AgreementDocumentView html={previewHtml} />
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <div><Label>Signatory name</Label><Input value={signerName} onChange={(e) => setSignerName(e.target.value)} className="mt-1" /></div>
            <div><Label>Email</Label><Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} className="mt-1" /></div>
            <div><Label>Phone</Label><Input value={signerPhone} onChange={(e) => setSignerPhone(e.target.value)} className="mt-1" /></div>
          </div>

          <div>
            <Label>Message to client</Label>
            <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} rows={3} className="mt-1" placeholder="Optional note included with the signing link…" />
          </div>

          {!signUrl ? (
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={handleSend} disabled={busy} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                <Send className="size-4" /> Send for Signature
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-4">
              <p className="font-semibold text-emerald-800">Agreement sent!</p>
              <p className="text-sm text-muted-foreground break-all">Signing link: {signUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(signUrl); toast.success("Link copied"); }}>
                  Copy link
                </Button>
                {signerEmail && mailtoLink(signerEmail, `Sign agreement: ${title}`, sendMsg) && (
                  <Button size="sm" variant="outline" onClick={() => { window.location.href = mailtoLink(signerEmail, `Sign agreement: ${title}`, sendMsg)!; }}>
                    Email client
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => window.open(whatsappLink(signerPhone, sendMsg), "_blank")}>
                  WhatsApp
                </Button>
                {draftId && (
                  <Button size="sm" onClick={() => navigate({ to: "/ca/agreements/$agreementId", params: { agreementId: draftId } })}>
                    View agreement
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
