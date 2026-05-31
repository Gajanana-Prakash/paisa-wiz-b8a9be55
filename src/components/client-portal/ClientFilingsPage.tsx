import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, AlertTriangle, Minus, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getClientFilings } from "@/lib/client-portal.functions";

const STATUS_UI = {
  filed: { label: "Filed", icon: CheckCircle2, className: "text-emerald-700" },
  pending: { label: "Pending", icon: Clock, className: "text-amber-700" },
  late: { label: "Late filed", icon: AlertTriangle, className: "text-orange-700" },
  na: { label: "Not applicable", icon: Minus, className: "text-muted-foreground" },
};

export function ClientFilingsPage() {
  const load = useServerFn(getClientFilings);
  const { data, isLoading } = useQuery({
    queryKey: ["client-filings"],
    queryFn: () => load({ data: undefined as any }),
  });
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const types = useMemo(() => {
    const set = new Set((data?.filings ?? []).map((f) => f.filingType));
    return Array.from(set).sort();
  }, [data?.filings]);

  const filtered = useMemo(() => {
    return (data?.filings ?? []).filter((f) => {
      if (typeFilter !== "all" && f.filingType !== typeFilter) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      return true;
    });
  }, [data?.filings, typeFilter, statusFilter]);

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">My filings</h1>
        <p className="text-muted-foreground mt-1">Your GST and tax filing history</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total this year", value: stats?.totalThisYear ?? 0 },
          { label: "On-time rate", value: `${stats?.onTimeRate ?? 0}%` },
          { label: "Late filings", value: stats?.lateCount ?? 0 },
          { label: "Upcoming", value: stats?.upcomingCount ?? 0 },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-semibold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px] h-11 text-base">
            <SelectValue placeholder="Filing type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] h-11 text-base">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="filed">Filed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="na">Not applicable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-base">Filing type</TableHead>
              <TableHead className="text-base">Period</TableHead>
              <TableHead className="text-base">Filed on</TableHead>
              <TableHead className="text-base">Status</TableHead>
              <TableHead className="text-base">Ack #</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No filings match your filters.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((f) => {
              const ui = STATUS_UI[f.status];
              const Icon = ui.icon;
              return (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.filingType}</TableCell>
                  <TableCell>{f.period}</TableCell>
                  <TableCell>
                    {f.filedOn
                      ? new Date(f.filedOn).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`gap-1 text-sm ${ui.className}`}>
                      <Icon className="size-3.5" />
                      {ui.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{f.ackNumber || "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
