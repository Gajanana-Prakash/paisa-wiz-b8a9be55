import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listAgreements } from "@/lib/agreements.functions";
import { AgreementStatusBadge } from "./AgreementStatusBadge";
import { AGREEMENT_TYPE_LABELS } from "./utils";
import { Button } from "@/components/ui/button";
import { Plus, FileSignature } from "lucide-react";

export function ClientAgreementsPanel({ clientId }: { clientId: string }) {
  const load = useServerFn(listAgreements);
  const { data, isLoading } = useQuery({
    queryKey: ["client-agreements", clientId],
    queryFn: () => load({ data: { clientId } }),
  });

  const agreements = data?.agreements ?? [];

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading agreements…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Agreements</h3>
        <Link to="/ca/agreements/new" search={{ clientId }}>
          <Button size="sm" className="gap-1.5">
            <Plus className="size-3.5" /> New Agreement
          </Button>
        </Link>
      </div>
      {agreements.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground text-sm">
          <FileSignature className="size-8 mx-auto mb-2 opacity-40" />
          No agreements yet for this client.
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Valid until</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {agreements.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{a.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {AGREEMENT_TYPE_LABELS[a.agreement_type] ?? a.agreement_type}
                  </td>
                  <td className="px-4 py-3">{a.valid_until}</td>
                  <td className="px-4 py-3"><AgreementStatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/ca/agreements/$agreementId" params={{ agreementId: a.id }} className="text-primary text-xs hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
