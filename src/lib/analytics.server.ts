export type DateRangePreset =
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "LAST_QUARTER"
  | "THIS_FY"
  | "CUSTOM";

export type ResolvedRange = {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  label: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthEnd(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function quarterStart(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function quarterEnd(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0);
}

/** Indian FY starts 1 April. */
function fyStart(d: Date) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(y, 3, 1);
}

function fyEnd(d: Date) {
  const start = fyStart(d);
  return new Date(start.getFullYear() + 1, 2, 31);
}

function prevPeriod(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const prevTo = addDays(f, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { prevFrom: iso(prevFrom), prevTo: iso(prevTo) };
}

export function resolveDateRange(
  preset: DateRangePreset,
  customFrom?: string,
  customTo?: string,
): ResolvedRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let from: Date;
  let to: Date;
  let label: string;

  switch (preset) {
    case "LAST_MONTH": {
      const m = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      from = monthStart(m);
      to = monthEnd(m);
      label = "Last month";
      break;
    }
    case "THIS_QUARTER": {
      from = quarterStart(today);
      to = today;
      label = "This quarter";
      break;
    }
    case "LAST_QUARTER": {
      const qStart = quarterStart(today);
      const prevQEnd = addDays(qStart, -1);
      from = quarterStart(prevQEnd);
      to = quarterEnd(prevQEnd);
      label = "Last quarter";
      break;
    }
    case "THIS_FY": {
      from = fyStart(today);
      to = today;
      label = "This financial year";
      break;
    }
    case "CUSTOM": {
      from = new Date(customFrom ?? iso(today));
      to = new Date(customTo ?? iso(today));
      label = `${customFrom} – ${customTo}`;
      break;
    }
    case "THIS_MONTH":
    default: {
      from = monthStart(today);
      to = today;
      label = "This month";
      break;
    }
  }

  const fromIso = iso(from);
  const toIso = iso(to);
  const { prevFrom, prevTo } = prevPeriod(fromIso, toIso);
  return { from: fromIso, to: toIso, prevFrom, prevTo, label };
}

export function lastNMonths(endDate: string, n: number): Array<{ key: string; label: string; from: string; to: string }> {
  const end = new Date(endDate);
  const months: Array<{ key: string; label: string; from: string; to: string }> = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const ms = monthStart(d);
    const me = monthEnd(d);
    months.push({
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: ms.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      from: iso(ms),
      to: iso(me),
    });
  }
  return months;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return round2(((current - previous) / previous) * 100);
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export const CHART_COLORS = {
  primary: "hsl(152 45% 28%)",
  primaryLight: "hsl(152 45% 28% / 0.35)",
  collected: "#10b981",
  invoiced: "hsl(152 45% 45%)",
  danger: "#ef4444",
  warning: "#f59e0b",
  muted: "#94a3b8",
  palette: ["#1f6f4a", "#10b981", "#059669", "#34d399", "#6ee7b7", "#047857", "#065f46", "#064e3b", "#a7f3d0", "#d1fae5"],
};
