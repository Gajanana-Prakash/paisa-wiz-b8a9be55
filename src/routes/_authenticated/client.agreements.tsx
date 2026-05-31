import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientAgreements } from "@/lib/agreements.functions";
import { AgreementStatusBadge } from "@/components/agreements/AgreementStatusBadge";
import { AGREEMENT_TYPE_LABELS } from "@/components/agreements/utils";
import { Button } from "@/components/ui/button";
import { FileSignature, ExternalLink, Download } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/client/agreements")({
  component: ClientAgreementsPage,
});

function ClientAgreementsPage() {
  const load = useServerFn(listClientAgreements);
  const { data, isLoading } = useQuery({
    queryKey: ["client-portal-agreements"],
    queryFn: () => load({ data: undefined as never }),
  });

  const agreements = data?.agreements ?? [];

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">My Agreements</h1>
        <p className="text-muted-foreground mt-1">Review and sign agreements from your CA firm.</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : agreements.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          <FileSignature className="size-10 mx-auto mb-3 opacity-40" />
          No agreements yet.
        </div>
      ) : (
        <div className="space-y-4">
          {agreements.map((a) => (
            <div key={a.id} className="rounded-2xl border bg-card p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-semibold">{a.title}</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {AGREEMENT_TYPE_LABELS[a.agreement_type] ?? a.agreement_type}
                  {a.valid_until && ` · Valid until ${a.valid_until}`}
                </p>
                <div className="mt-2"><AgreementStatusBadge status={a.status} /></div>
              </div>
              <div className="flex gap-2">
                {a.signToken && ["SENT", "VIEWED"].includes(a.status) && (
                  <Link to="/sign/$token" params={{ token: a.signToken }}>
                    <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                      <ExternalLink className="size-3.5" /> Sign now
                    </Button>
                  </Link>
                )}
                {a.status === "SIGNED" && a.signed_pdf_url && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => window.open(a.signed_pdf_url!, "_blank")}>
                    <Download className="size-3.5" /> Download
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
