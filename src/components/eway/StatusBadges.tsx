import { Badge } from "@/components/ui/badge";
import { Truck, TrainFront, Plane, Ship } from "lucide-react";

export type EwbStatus = "ACTIVE" | "CANCELLED" | "EXPIRED" | "EXTENDED";

export function EwbStatusBadge({ status }: { status: EwbStatus }) {
  if (status === "ACTIVE")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">Active</Badge>;
  if (status === "EXTENDED")
    return <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 border-sky-200">Extended</Badge>;
  if (status === "EXPIRED")
    return <Badge variant="destructive" className="opacity-90">Expired</Badge>;
  return <Badge variant="destructive" className="line-through opacity-90">Cancelled</Badge>;
}

export function TransportModeIcon({ mode }: { mode: "ROAD" | "RAIL" | "AIR" | "SHIP" }) {
  const Icon = mode === "RAIL" ? TrainFront : mode === "AIR" ? Plane : mode === "SHIP" ? Ship : Truck;
  return <Icon className="size-4 text-muted-foreground" aria-label={mode.toLowerCase()} />;
}

export function ValidityCountdown({ validUntil, hours }: { validUntil: string | null; hours: number | null }) {
  if (!validUntil || hours == null) return <span className="text-muted-foreground text-xs">—</span>;
  const expired = hours <= 0;
  const tone =
    expired
      ? "text-rose-700 font-semibold"
      : hours <= 24
        ? "text-rose-700 font-semibold"
        : hours <= 48
          ? "text-amber-700 font-medium"
          : "text-muted-foreground";
  const label = expired
    ? "Expired"
    : hours < 24
      ? `${hours}h remaining`
      : `${Math.floor(hours / 24)}d ${hours % 24}h remaining`;
  return (
    <div className="leading-tight">
      <div className={`text-xs ${tone}`}>{label}</div>
      <div className="text-[10px] text-muted-foreground">{new Date(validUntil).toLocaleString("en-IN")}</div>
    </div>
  );
}

export function EwbSandboxBanner({ mockMode, sandbox }: { mockMode: boolean; sandbox: boolean }) {
  if (mockMode) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-xs flex items-center gap-2">
        <span className="font-semibold">MOCK MODE</span>
        <span>E-way bill is running in mock mode — no requests are sent to the live NIC EWB portal.</span>
      </div>
    );
  }
  if (sandbox) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-xs flex items-center gap-2">
        <span className="font-semibold">SANDBOX MODE</span>
        <span>Not submitting to the live NIC EWB portal.</span>
      </div>
    );
  }
  return null;
}
