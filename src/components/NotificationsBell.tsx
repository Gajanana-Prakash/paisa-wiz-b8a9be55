import { useEffect, useMemo, useState } from "react";
import { Bell, FileText, AlertTriangle, CheckCircle2, Upload, CalendarClock, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type NType = "uploaded" | "review" | "validated" | "processing" | "mismatch" | "doc_fulfilled" | "due_soon" | "overdue" | "task_overdue" | "task_due_soon";

type Notif = {
  id: string;
  type: NType;
  title: string;
  detail: string;
  at: string;
};

const READ_KEY = "gstify_notifs_read_at";

function statusToType(s: string | null | undefined): NType {
  if (s === "review") return "review";
  if (s === "validated") return "validated";
  if (s === "processing") return "processing";
  return "uploaded";
}

function buildInvoiceNotif(row: any): Notif {
  const flags = Array.isArray(row.validation_flags) ? row.validation_flags : [];
  const hasMismatch = flags.some((f: any) =>
    typeof f === "string" ? /mismatch|gst/i.test(f) : /mismatch|gst/i.test(f?.code || f?.message || ""),
  );
  const type: NType = hasMismatch ? "mismatch" : statusToType(row.status);
  const vendor = row.vendor_name || row.file_name || "Invoice";
  const num = row.invoice_number ? ` #${row.invoice_number}` : "";
  const titles: Record<NType, string> = {
    uploaded: "Invoice uploaded",
    processing: "Invoice processing",
    review: "Needs review",
    validated: "Invoice validated",
    mismatch: "GST mismatch detected",
    doc_fulfilled: "Document request fulfilled",
    due_soon: "Filing due soon",
    overdue: "Compliance overdue",
    task_overdue: "Task overdue",
    task_due_soon: "Task due soon",
  };
  return {
    id: row.id,
    type,
    title: titles[type],
    detail: `${vendor}${num}`,
    at: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

function buildDocReqNotif(row: any): Notif {
  return {
    id: `dr-${row.id}`,
    type: "doc_fulfilled",
    title: "Document request fulfilled",
    detail: `${row.doc_type ?? "Request"}${row.period_label ? ` — ${row.period_label}` : ""}`,
    at: row.fulfilled_at || row.updated_at || new Date().toISOString(),
  };
}

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function nextGstDue(): { date: Date; iso: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 20);
  return { date: d, iso: d.toISOString() };
}

export function NotificationsBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [readAt, setReadAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem(READ_KEY) || 0);
  });

  // Synthetic filing-due notice within 3 days
  const dueSoonNotif = useMemo<Notif | null>(() => {
    const { date, iso } = nextGstDue();
    const diffDays = (date.getTime() - Date.now()) / 86400000;
    if (diffDays > 0 && diffDays <= 3) {
      return {
        id: `due-${iso.slice(0, 10)}`,
        type: "due_soon",
        title: "GSTR-3B filing due soon",
        detail: `Due ${date.toLocaleDateString()} (in ${Math.ceil(diffDays)} day${Math.ceil(diffDays) > 1 ? "s" : ""})`,
        at: new Date().toISOString(),
      };
    }
    return null;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const in7 = new Date(today.getTime() + 7 * 86400000);
      const toISO = (d: Date) => d.toISOString().slice(0, 10);
      const [{ data: inv }, { data: req }, { data: dls }, { data: tks }] = await Promise.all([
        supabase.from("invoices")
          .select("id,status,vendor_name,invoice_number,file_name,validation_flags,created_at,updated_at")
          .order("updated_at", { ascending: false }).limit(15),
        supabase.from("document_requests")
          .select("id,doc_type,period_label,status,fulfilled_at,updated_at")
          .eq("status", "complete")
          .order("fulfilled_at", { ascending: false }).limit(10),
        supabase.from("compliance_deadlines")
          .select("id,due_date,status,period_label,updated_at,clients!inner(business_name),compliance_types!inner(name)")
          .in("status", ["PENDING", "IN_PROGRESS"])
          .lte("due_date", toISO(in7))
          .order("due_date", { ascending: true }).limit(20),
        supabase.from("tasks")
          .select("id,title,due_date,status,updated_at,clients(business_name)")
          .not("status", "in", "(COMPLETED,CANCELLED)")
          .not("due_date", "is", null)
          .lte("due_date", toISO(in7))
          .order("due_date", { ascending: true }).limit(20),
      ]);
      if (!mounted) return;
      const complianceNotifs: Notif[] = (dls ?? []).map((d: any) => {
        const overdue = d.due_date < toISO(today);
        return {
          id: `dl-${d.id}`,
          type: overdue ? "overdue" : "due_soon",
          title: overdue ? `${d.compliance_types?.name ?? "Compliance"} overdue` : `${d.compliance_types?.name ?? "Compliance"} due soon`,
          detail: `${d.clients?.business_name ?? ""} · ${d.period_label} · ${new Date(d.due_date).toLocaleDateString()}`,
          at: d.updated_at || new Date().toISOString(),
        };
      });
      const taskNotifs: Notif[] = (tks ?? []).map((t: any) => {
        const overdue = t.due_date < toISO(today);
        return {
          id: `tk-${t.id}`,
          type: overdue ? "task_overdue" : "task_due_soon",
          title: overdue ? "Task overdue" : "Task due soon",
          detail: `${t.title}${t.clients?.business_name ? ` · ${t.clients.business_name}` : ""} · ${new Date(t.due_date).toLocaleDateString()}`,
          at: t.updated_at || new Date().toISOString(),
        };
      });
      const merged: Notif[] = [
        ...(dueSoonNotif ? [dueSoonNotif] : []),
        ...complianceNotifs,
        ...taskNotifs,
        ...(inv ?? []).map(buildInvoiceNotif),
        ...(req ?? []).map(buildDocReqNotif),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 30);
      setItems(merged);
    })();


    const ch = supabase
      .channel("notif-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "invoices" }, (p) => {
        const n = buildInvoiceNotif(p.new);
        setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 25));
        toast.success(n.title, { description: n.detail });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "invoices" }, (p) => {
        const before = p.old as any, after = p.new as any;
        const flagsChanged = JSON.stringify(before.validation_flags) !== JSON.stringify(after.validation_flags);
        if (after.status === before.status && !flagsChanged) return;
        const n = buildInvoiceNotif(after);
        setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 25));
        if (n.type === "mismatch") toast.error(n.title, { description: n.detail });
        else if (n.type === "review") toast.warning(n.title, { description: n.detail });
        else if (n.type === "validated") toast.success(n.title, { description: n.detail });
        else toast(n.title, { description: n.detail });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "document_requests" }, (p) => {
        const after = p.new as any;
        if (after.status !== "complete" || (p.old as any).status === "complete") return;
        const n = buildDocReqNotif(after);
        setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 25));
        toast.success(n.title, { description: n.detail });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_conversations" }, (p) => {
        const row = p.new as any;
        if (row.channel !== "IN_APP" || row.direction !== "INBOUND") return;
        const n: Notif = {
          id: `msg-${row.id}`,
          type: "uploaded",
          title: "Client replied",
          detail: String(row.body ?? "").slice(0, 80),
          at: row.sent_at || new Date().toISOString(),
        };
        setItems((prev) => [n, ...prev].slice(0, 25));
        toast.success(n.title, { description: n.detail });
      })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [dueSoonNotif]);

  const unread = items.filter((i) => new Date(i.at).getTime() > readAt).length;

  const markRead = () => {
    const now = Date.now();
    setReadAt(now);
    if (typeof window !== "undefined") localStorage.setItem(READ_KEY, String(now));
  };

  return (
    <DropdownMenu onOpenChange={(o) => { if (!o) markRead(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold grid place-items-center ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
          <span className="font-medium">Notifications</span>
          {unread > 0 && <span className="text-xs text-muted-foreground">{unread} new</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No notifications yet. Upload an invoice to get started.
            </div>
          ) : (
            items.map((n) => {
              const Icon =
                n.type === "mismatch" ? AlertTriangle :
                n.type === "review" ? AlertTriangle :
                n.type === "overdue" ? AlertTriangle :
                n.type === "task_overdue" ? AlertTriangle :
                n.type === "validated" ? CheckCircle2 :
                n.type === "uploaded" ? Upload :
                n.type === "doc_fulfilled" ? Inbox :
                n.type === "due_soon" ? CalendarClock :
                n.type === "task_due_soon" ? CalendarClock : FileText;
              const tone =
                n.type === "mismatch" ? "text-rose-600 bg-rose-500/10" :
                n.type === "overdue" ? "text-rose-600 bg-rose-500/10" :
                n.type === "task_overdue" ? "text-rose-600 bg-rose-500/10" :
                n.type === "review" ? "text-amber-600 bg-amber-500/10" :
                n.type === "validated" ? "text-emerald-600 bg-emerald-500/10" :
                n.type === "doc_fulfilled" ? "text-emerald-600 bg-emerald-500/10" :
                n.type === "due_soon" ? "text-amber-600 bg-amber-500/10" :
                n.type === "task_due_soon" ? "text-amber-600 bg-amber-500/10" :
                "text-primary bg-primary/10";
              const isNew = new Date(n.at).getTime() > readAt;
              return (
                <div key={n.id + n.at} className={`flex gap-3 px-4 py-3 border-b border-border/50 last:border-0 ${isNew ? "bg-primary/[0.03]" : ""}`}>
                  <div className={`size-9 rounded-lg grid place-items-center shrink-0 ${tone}`}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{n.detail}</div>
                    <div className="text-[11px] text-muted-foreground/70 mt-0.5">{timeAgo(n.at)}</div>
                  </div>
                  {isNew && <span className="size-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
