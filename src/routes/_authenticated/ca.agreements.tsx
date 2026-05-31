import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgreementStats, listAgreements } from "@/lib/agreements.functions";
import { AgreementStatusBadge } from "@/components/agreements/AgreementStatusBadge";
import { AGREEMENT_TYPE_LABELS } from "@/components/agreements/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, FileSignature, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ca/agreements")({
  component: AgreementsDashboard,
});

function AgreementsDashboard() {
  const loadStats = useServerFn(getAgreementStats);
  const loadList = useServerFn(listAgreements);
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: stats } = useQuery({
    queryKey: ["agreement-stats"],
    queryFn: () => loadStats({ data: undefined as never }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["agreements", status, type, search],
    queryFn: () =>
      loadList({
        data: {
          status: status === "all" ? undefined : (status as never),
          agreementType: type === "all" ? undefined : (type as never),
          search: search || undefined,
        },
      }),
  });

  const agreements = useMemo(() => data?.agreements ?? [], [data]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Agreements</h1>
          <p className="text-muted-foreground mt-1">
            Send, track, and manage service agreements and engagement letters.
          </p>
        </div>
        <Link to="/ca/agreements/new">
          <Button className="gap-1.5"><Plus className="size-4" /> New Agreement</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<CheckCircle2 className="size-5 text-emerald-600" />} label="Active" value={stats?.active ?? 0} />
        <StatCard icon={<Clock className="size-5 text-orange-500" />} label="Pending signature" value={stats?.pendingSignature ?? 0} />
        <StatCard icon={<AlertTriangle className="size-5 text-amber-600" />} label="Expiring in 30 days" value={stats?.expiringSoon ?? 0} />
        <StatCard icon={<FileSignature className="size-5 text-muted-foreground" />} label="Expired" value={stats?.expired ?? 0} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search client or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="VIEWED">Viewed</SelectItem>
            <SelectItem value="SIGNED">Signed</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(AGREEMENT_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Sent</th>
              <th className="px-4 py-3 font-medium">Signed</th>
              <th className="px-4 py-3 font-medium">Valid until</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && agreements.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No agreements found.</td></tr>
            )}
            {agreements.map((a) => (
              <tr key={a.id} className="border-t hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">
                  {(a.clients as { business_name?: string } | null)?.business_name ?? "—"}
                </td>
                <td className="px-4 py-3">{a.title}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {AGREEMENT_TYPE_LABELS[a.agreement_type] ?? a.agreement_type}
                </td>
                <td className="px-4 py-3">{a.sent_at ? new Date(a.sent_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">{a.signed_at ? new Date(a.signed_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">{a.valid_until}</td>
                <td className="px-4 py-3"><AgreementStatusBadge status={a.status} /></td>
                <td className="px-4 py-3 text-right">
                  <Link to="/ca/agreements/$agreementId" params={{ agreementId: a.id }} className="text-primary hover:underline text-xs">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">{icon}{label}</div>
      <div className="text-3xl font-semibold mt-2">{value}</div>
    </div>
  );
}
