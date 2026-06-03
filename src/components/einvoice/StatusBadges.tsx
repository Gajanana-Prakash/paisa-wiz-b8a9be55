import { Badge } from "@/components/ui/badge";

export function IrnStatusBadge({ status }: { status: "PENDING" | "GENERATED" | "CANCELLED" | "FAILED" }) {
  if (status === "GENERATED")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">IRN Active</Badge>;
  if (status === "CANCELLED")
    return <Badge variant="destructive" className="line-through opacity-90">Cancelled</Badge>;
  if (status === "FAILED")
    return <Badge variant="destructive">Failed — Retry</Badge>;
  return <Badge variant="secondary" className="text-muted-foreground">Awaiting IRN</Badge>;
}

export function DeadlineCountdown({ deadline, days }: { deadline: string | null; days: number | null }) {
  if (!deadline || days == null) return <span className="text-muted-foreground text-xs">—</span>;
  const tone =
    days <= 3
      ? "text-rose-700 font-semibold"
      : days <= 7
        ? "text-amber-700 font-medium"
        : "text-muted-foreground";
  const label =
    days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "Today" : `${days} days left`;
  return (
    <div className="leading-tight">
      <div className={`text-xs ${tone}`}>{label}</div>
      <div className="text-[10px] text-muted-foreground">{deadline}</div>
    </div>
  );
}

export function SandboxBanner({ mockMode, sandbox }: { mockMode: boolean; sandbox: boolean }) {
  if (mockMode) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-xs flex items-center gap-2">
        <span className="font-semibold">MOCK MODE</span>
        <span>e-Invoicing is running in mock mode — no requests are sent to the live IRP portal.</span>
      </div>
    );
  }
  if (sandbox) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-xs flex items-center gap-2">
        <span className="font-semibold">SANDBOX MODE</span>
        <span>Not submitting to the live IRP portal.</span>
      </div>
    );
  }
  return null;
}
