import {
  FileText, FileSearch, FileCheck2, ClipboardCheck, BookOpen, AlertOctagon, Inbox, Tag,
  type LucideIcon,
} from "lucide-react";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskType =
  | "GST_FILING" | "TDS_RETURN" | "ITR_FILING" | "AUDIT" | "BOOKKEEPING"
  | "NOTICE_REPLY" | "DOCUMENT_COLLECTION" | "OTHER";

export const STATUS_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "TODO", label: "To do" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "REVIEW", label: "Review" },
  { key: "COMPLETED", label: "Completed" },
];

export const TYPE_LABELS: Record<TaskType, string> = {
  GST_FILING: "GST Filing",
  TDS_RETURN: "TDS Return",
  ITR_FILING: "ITR Filing",
  AUDIT: "Audit",
  BOOKKEEPING: "Bookkeeping",
  NOTICE_REPLY: "Notice Reply",
  DOCUMENT_COLLECTION: "Document Collection",
  OTHER: "Other",
};

export const TYPE_ICONS: Record<TaskType, LucideIcon> = {
  GST_FILING: FileText,
  TDS_RETURN: FileSearch,
  ITR_FILING: FileCheck2,
  AUDIT: ClipboardCheck,
  BOOKKEEPING: BookOpen,
  NOTICE_REPLY: AlertOctagon,
  DOCUMENT_COLLECTION: Inbox,
  OTHER: Tag,
};

export const PRIORITY_ORDER: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  URGENT: "Urgent", HIGH: "High", MEDIUM: "Medium", LOW: "Low",
};

/** Tailwind classes for priority pills (uses semantic tokens / safe utility colors). */
export const PRIORITY_PILL: Record<TaskPriority, string> = {
  URGENT: "bg-priority-urgent/15 text-priority-urgent border border-priority-urgent/30",
  HIGH: "bg-priority-high/15 text-priority-high border border-priority-high/30",
  MEDIUM: "bg-priority-medium/15 text-priority-medium-foreground border border-priority-medium/40",
  LOW: "bg-muted text-muted-foreground border border-border",
};

export const PRIORITY_DOT: Record<TaskPriority, string> = {
  URGENT: "bg-priority-urgent",
  HIGH: "bg-priority-high",
  MEDIUM: "bg-priority-medium",
  LOW: "bg-muted-foreground/50",
};

export function isOverdue(dueDate: string | null | undefined, status: TaskStatus): boolean {
  if (!dueDate || status === "COMPLETED" || status === "CANCELLED") return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}
export function isDueToday(dueDate: string | null | undefined, status: TaskStatus): boolean {
  if (!dueDate || status === "COMPLETED" || status === "CANCELLED") return false;
  return dueDate === new Date().toISOString().slice(0, 10);
}
export function dueLabel(dueDate: string | null | undefined): string {
  if (!dueDate) return "No date";
  const d = new Date(dueDate + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || name.slice(0, 2).toUpperCase();
}
