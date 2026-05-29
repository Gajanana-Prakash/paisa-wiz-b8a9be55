export function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export type CaInvoiceStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

export const STATUS_META: Record<
  CaInvoiceStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  SENT: { label: "Sent", className: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  PARTIALLY_PAID: { label: "Partial", className: "bg-amber-500/15 text-amber-800 border-amber-500/30" },
  PAID: { label: "Paid", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  OVERDUE: { label: "Overdue", className: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground line-through border-border" },
};

export function whatsappLink(phone: string | null | undefined, text: string) {
  const p = (phone || "").replace(/[^\d]/g, "");
  const enc = encodeURIComponent(text);
  return p ? `https://wa.me/${p}?text=${enc}` : `https://wa.me/?text=${enc}`;
}

export function mailtoLink(email: string | null | undefined, subject: string, body: string) {
  if (!email) return null;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
