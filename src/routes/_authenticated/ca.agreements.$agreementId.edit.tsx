import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgreement, updateAgreement, previewMergedAgreement } from "@/lib/agreements.functions";
import { AgreementContentEditor } from "@/components/agreements/AgreementContentEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ca/agreements/$agreementId/edit")({
  component: EditAgreementPage,
});

function EditAgreementPage() {
  const { agreementId } = Route.useParams();
  const navigate = useNavigate();
  const load = useServerFn(getAgreement);
  const runUpdate = useServerFn(updateAgreement);
  const runPreview = useServerFn(previewMergedAgreement);

  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [clientId, setClientId] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["agreement", agreementId],
    queryFn: () => load({ data: { id: agreementId } }),
  });

  useEffect(() => {
    const a = data?.agreement;
    if (!a) return;
    setTitle(a.title);
    setContentHtml(a.content_html);
    setClientId(a.client_id);
    setServices(a.services_included ?? []);
    setValidFrom(a.valid_from);
    setValidUntil(a.valid_until);
  }, [data]);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data?.agreement || data.agreement.status !== "DRAFT") {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Only draft agreements can be edited.</p>
        <Link to="/ca/agreements/$agreementId" params={{ agreementId }} className="text-primary text-sm mt-2 inline-block">Back</Link>
      </div>
    );
  }

  const save = async () => {
    setBusy(true);
    try {
      await runUpdate({
        data: { id: agreementId, title, contentHtml, servicesIncluded: services, validFrom, validUntil },
      });
      toast.success("Saved");
      navigate({ to: "/ca/agreements/$agreementId", params: { agreementId } });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    try {
      const r = await runPreview({
        data: {
          clientId,
          contentHtml,
          servicesIncluded: services,
          validFrom,
          validUntil,
          feeAmount: data.agreement.fee_amount != null ? Number(data.agreement.fee_amount) : null,
          feeFrequency: data.agreement.fee_frequency as never,
        },
      });
      setPreviewHtml(r.html);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link to="/ca/agreements/$agreementId" params={{ agreementId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="font-display text-2xl font-semibold">Edit draft agreement</h1>
      <div>
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
      </div>
      <AgreementContentEditor value={contentHtml} onChange={setContentHtml} previewHtml={previewHtml} onPreview={preview} />
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>Save</Button>
        <Button variant="outline" onClick={() => navigate({ to: "/ca/agreements/$agreementId", params: { agreementId } })}>Cancel</Button>
      </div>
    </div>
  );
}
