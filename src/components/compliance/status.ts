/**
 * Shared status helpers for compliance UI.
 * Returns a semantic-token-backed tone for each deadline state.
 */

export type DeadlineStatus =
  | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "NOT_APPLICABLE";

export type Tone = "red" | "orange" | "yellow" | "green" | "gray";

export function toneFor(due: string, status: DeadlineStatus): Tone {
  if (status === "COMPLETED" || status === "NOT_APPLICABLE") return "gray";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due); d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "red";
  if (days <= 3) return "orange";
  if (days <= 7) return "yellow";
  return "green";
}

export const TONE_PILL: Record<Tone, string> = {
  red:    "bg-destructive/10 text-destructive border border-destructive/30",
  orange: "bg-warning/15 text-warning-foreground border border-warning/40 [--warning-foreground:oklch(0.4_0.18_55)]",
  yellow: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30",
  green:  "bg-success/10 text-success border border-success/30 [--success:oklch(0.45_0.13_160)]",
  gray:   "bg-muted text-muted-foreground border border-border",
};

export const TONE_DOT: Record<Tone, string> = {
  red:    "bg-destructive",
  orange: "bg-warning",
  yellow: "bg-amber-500",
  green:  "bg-success",
  gray:   "bg-muted-foreground",
};

export const TONE_LABEL: Record<Tone, string> = {
  red: "Overdue",
  orange: "Due ≤ 3d",
  yellow: "Due ≤ 7d",
  green: "Upcoming",
  gray: "Done",
};

export const CATEGORY_LABEL: Record<string, string> = {
  GST: "GST",
  TDS: "TDS",
  ITR: "Income Tax",
  ROC_MCA: "ROC / MCA",
  PF_ESI: "PF / ESI",
  AUDIT: "Audit",
};