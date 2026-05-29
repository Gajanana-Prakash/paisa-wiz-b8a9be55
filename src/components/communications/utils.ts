import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import {
  MessageSquare, Mail, Phone, StickyNote, Video, MessagesSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type CommChannel = "IN_APP" | "EMAIL" | "WHATSAPP" | "PHONE_CALL" | "MEETING" | "NOTE" | "ALL";

export const CHANNEL_FILTERS: { id: CommChannel; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "IN_APP", label: "In-App" },
  { id: "EMAIL", label: "Email" },
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "PHONE_CALL", label: "Calls" },
  { id: "NOTE", label: "Notes" },
];

export const CHANNEL_META: Record<
  Exclude<CommChannel, "ALL">,
  { label: string; icon: LucideIcon; emoji: string }
> = {
  IN_APP: { label: "In-App", icon: MessageSquare, emoji: "💬" },
  EMAIL: { label: "Email", icon: Mail, emoji: "📧" },
  WHATSAPP: { label: "WhatsApp", icon: MessagesSquare, emoji: "🟢" },
  PHONE_CALL: { label: "Call", icon: Phone, emoji: "📞" },
  MEETING: { label: "Meeting", icon: Video, emoji: "🤝" },
  NOTE: { label: "Note", icon: StickyNote, emoji: "📝" },
};

export function formatCommTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return formatDistanceToNow(d, { addSuffix: true });
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "dd MMM yyyy, h:mm a");
}

export function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function isNeutralCard(channel: string): boolean {
  return channel === "PHONE_CALL" || channel === "MEETING" || channel === "NOTE";
}
