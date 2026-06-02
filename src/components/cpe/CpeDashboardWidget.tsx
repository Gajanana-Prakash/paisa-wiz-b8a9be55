import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { getCpeSummary } from "@/lib/cpe.functions";

const STATUS_META = {
  on_track:  { label: "On track",       color: "text-emerald-600", bg: "bg-emerald-500/10",  Icon: CheckCircle2 },
  attention: { label: "Attention needed", color: "text-amber-600",  bg: "bg-amber-500/10",   Icon: AlertTriangle },
  at_risk:   { label: "At risk",         color: "text-rose-600",   bg: "bg-rose-500/10",     Icon: XCircle },
};

export function CpeDashboardWidget() {
  const fn = useServerFn(getCpeSummary);
  const { data, isError } = useQuery({
    queryKey: ["cpe-summary"],
    queryFn: () => fn({ data: undefined as any }),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (isError || !data) return null;

  const { total, profile, status } = data;
  const required = profile.cpe_hours_required;
  const pct = Math.min(100, Math.round((total / required) * 100));
  const meta = STATUS_META[status];

  return (
    <Link to="/ca/my-profile/cpe" className="block">
      <div className={`rounded-2xl border p-4 ${meta.bg} hover:opacity-80 transition cursor-pointer`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <GraduationCap className={`size-4 ${meta.color}`} />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My CPE</span>
          </div>
          <div className={`flex items-center gap-1 text-xs font-medium ${meta.color}`}>
            <meta.Icon className="size-3.5" />
            {meta.label}
          </div>
        </div>
        <div className="flex items-end gap-2 mb-2">
          <span className="text-2xl font-bold tabular-nums">{total}</span>
          <span className="text-muted-foreground text-sm mb-0.5">/ {required} hrs</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${status === "on_track" ? "bg-emerald-500" : status === "attention" ? "bg-amber-500" : "bg-rose-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">{pct}% of current CPE block</div>
      </div>
    </Link>
  );
}
