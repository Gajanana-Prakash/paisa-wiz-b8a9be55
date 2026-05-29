export type DscComputedStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "REVOKED";

export function daysUntil(expiryDate: string, today: string = new Date().toISOString().slice(0, 10)): number {
  const exp = new Date(expiryDate);
  const t = new Date(today);
  exp.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - t.getTime()) / 86400000);
}

export function computeDscStatus(
  expiryDate: string,
  storedStatus: string,
  today: string = new Date().toISOString().slice(0, 10),
): DscComputedStatus {
  if (storedStatus === "REVOKED") return "REVOKED";
  const days = daysUntil(expiryDate, today);
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "EXPIRING_SOON";
  return "ACTIVE";
}

export type DaysStyle = {
  label: string;
  className: string;
  pulse?: boolean;
};

export function daysRemainingStyle(days: number, expired: boolean): DaysStyle {
  if (expired || days < 0) {
    return { label: days < 0 ? `${Math.abs(days)}d ago` : "Expired", className: "text-muted-foreground line-through", pulse: false };
  }
  if (days <= 7) {
    return { label: `${days}d`, className: "text-rose-700 font-semibold", pulse: true };
  }
  if (days <= 30) {
    return { label: `${days}d`, className: "text-orange-600 font-semibold", pulse: false };
  }
  if (days <= 90) {
    return { label: `${days}d`, className: "text-amber-600 font-medium", pulse: false };
  }
  return { label: `${days}d`, className: "text-emerald-700 font-medium", pulse: false };
}

export function addYears(isoDate: string, years: number): string {
  const d = new Date(isoDate);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export const ISSUING_AUTHORITIES = [
  "eMudhra",
  "Sify",
  "NSDL",
  "TCS-CA",
  "Capricorn",
  "Other",
] as const;

export const USED_FOR_OPTIONS = [
  { id: "GST_FILING", label: "GST Filing" },
  { id: "MCA_FILING", label: "MCA Filing" },
  { id: "IT_FILING", label: "IT Filing" },
  { id: "OTHER", label: "Other" },
] as const;
