import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatInr } from "@/components/billing/utils";

export function KpiCard({
  label,
  value,
  sub,
  changePct,
  loading,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  changePct?: number | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("rounded-2xl border bg-card p-5 space-y-3", className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  const display = typeof value === "number" ? formatInr(value) : value;

  return (
    <div className={cn("rounded-2xl border bg-card p-5", className)}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{display}</div>
      {(sub || changePct != null) && (
        <div className="flex items-center gap-2 mt-2 text-xs">
          {changePct != null && (
            <span className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              changePct >= 0 ? "text-emerald-600" : "text-rose-600",
            )}>
              {changePct >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {Math.abs(changePct)}% vs last period
            </span>
          )}
          {sub && <span className="text-muted-foreground">{sub}</span>}
        </div>
      )}
    </div>
  );
}

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border bg-card p-5 space-y-3">
      <Skeleton className="h-5 w-48" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-5 h-80">
      <Skeleton className="h-5 w-40 mb-4" />
      <Skeleton className="h-[85%] w-full" />
    </div>
  );
}

export function billableColor(pct: number) {
  if (pct >= 70) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-rose-600";
}

export function workloadBarColor(hours: number, target: number) {
  const pct = target > 0 ? (hours / target) * 100 : 0;
  if (pct >= 100) return "#10b981";
  if (pct >= 70) return "#f59e0b";
  return "#ef4444";
}

export function riskColor(score: number) {
  if (score === 0) return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (score <= 3) return "bg-amber-500/15 text-amber-800 border-amber-500/30";
  return "bg-rose-500/15 text-rose-700 border-rose-500/30";
}

export function revPerHourColor(rph: number, avg: number) {
  return rph >= avg ? "text-emerald-600 font-medium" : "text-rose-600 font-medium";
}
