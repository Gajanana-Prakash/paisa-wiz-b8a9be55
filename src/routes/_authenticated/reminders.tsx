import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listReminderRules, upsertReminderRule, deleteReminderRule,
  listReminderHistory, computeUpcomingReminders, logReminder,
} from "@/lib/reminders.functions";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bell, Plus, Trash2, Send, Copy, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reminders")({ component: RemindersPage });

type Channel = "in_app" | "email" | "whatsapp";
type Trigger = "gst_due_offset" | "monthly_day" | "stale_upload_days" | "manual";

const TRIGGER_LABELS: Record<Trigger, string> = {
  gst_due_offset: "Before GST due date",
  monthly_day: "Monthly on day",
  stale_upload_days: "Stale upload (no activity)",
  manual: "Manual only",
};

function whatsappLink(phone: string | null | undefined, text: string) {
  const p = (phone || "").replace(/[^\d]/g, "");
  const enc = encodeURIComponent(text);
  return p ? `https://wa.me/${p}?text=${enc}` : `https://wa.me/?text=${enc}`;
}

function RemindersPage() {
  const { firm, availableClients, role } = useTenant();
  const isCA = role === "ca_owner" || role === "ca_staff";

  const list = useServerFn(listReminderRules);
  const upsert = useServerFn(upsertReminderRule);
  const remove = useServerFn(deleteReminderRule);
  const hist = useServerFn(listReminderHistory);
  const compute = useServerFn(computeUpcomingReminders);
  const logIt = useServerFn(logReminder);

  const [rules, setRules] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [gstDue, setGstDue] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<any | null>(null);

  const load = async () => {
    if (!firm) return;
    setBusy(true);
    try {
      const [r, h, u] = await Promise.all([
        list({ data: { caFirmId: firm.id } }),
        hist({ data: { caFirmId: firm.id, limit: 50 } }),
        compute({ data: { caFirmId: firm.id } }),
      ]);
      setRules(r.rules);
      setHistory(h.reminders);
      setUpcoming(u.upcoming);
      setGstDue(u.gstDue);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [firm?.id]);

  const phoneByClient = useMemo(() => {
    const m = new Map<string, string | null>();
    availableClients.forEach((c) => m.set(c.id, (c as any).contact_phone ?? null));
    return m;
  }, [availableClients]);

  if (!isCA) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <Bell className="size-10 mx-auto text-muted-foreground" />
        <h1 className="font-display text-2xl mt-3">Reminders are managed by your CA</h1>
        <p className="text-muted-foreground mt-1">You'll receive in-app, email, or WhatsApp nudges when documents are due.</p>
      </div>
    );
  }

  const sendReminder = async (u: any) => {
    if (!firm) return;
    const client = availableClients.find((c) => c.id === u.clientId);
    const phone = phoneByClient.get(u.clientId);
    if (u.channels.includes("whatsapp")) {
      window.open(whatsappLink(phone, u.message), "_blank");
    }
    try {
      for (const ch of u.channels) {
        await logIt({
          data: {
            caFirmId: firm.id, clientId: u.clientId, ruleId: u.ruleId,
            channel: ch as Channel, message: u.message, dueForDate: u.dueOn, status: "sent",
          },
        });
      }
      toast.success(`Reminder logged for ${client?.business_name}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">Compliance Reminders</h1>
          <p className="text-muted-foreground mt-1">
            Auto-nudge clients before GST due dates, on monthly cycles, or when uploads go stale.
            Next GSTR-3B due: <span className="font-medium text-foreground">{gstDue || "—"}</span>
          </p>
        </div>
        <Dialog open={!!editor} onOpenChange={(o) => !o && setEditor(null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditor({
              name: "", triggerType: "gst_due_offset", offsetDays: 7,
              dayOfMonth: 1, messageTemplate: "Hi {client}, please upload pending bills. GSTR-3B due {due_date}.",
              channels: ["in_app", "whatsapp"], enabled: true, clientId: null,
            })}><Plus className="size-4 mr-2"/>New rule</Button>
          </DialogTrigger>
          {editor && <RuleEditor
            editor={editor} setEditor={setEditor}
            clients={availableClients}
            onSave={async () => {
              if (!firm) return;
              try {
                await upsert({
                  data: {
                    id: editor.id,
                    caFirmId: firm.id,
                    clientId: editor.clientId,
                    name: editor.name,
                    triggerType: editor.triggerType,
                    offsetDays: editor.offsetDays ?? null,
                    dayOfMonth: editor.dayOfMonth ?? null,
                    messageTemplate: editor.messageTemplate,
                    channels: editor.channels,
                    enabled: editor.enabled,
                  },
                });
                toast.success("Rule saved");
                setEditor(null); load();
              } catch (e: any) { toast.error(e.message); }
            }}
          />}
        </Dialog>
      </header>

      {/* Upcoming */}
      <section>
        <h2 className="font-display text-lg mb-3">Upcoming nudges {busy && <Loader2 className="inline size-4 animate-spin ml-2"/>}</h2>
        {upcoming.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No reminders due right now. Create a rule to start nudging.</Card>
        ) : (
          <div className="grid gap-3">
            {upcoming.map((u, i) => (
              <Card key={i} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.clientName}</span>
                    <Badge variant="outline">{u.ruleName}</Badge>
                    <span className="text-xs text-muted-foreground">{u.reason}</span>
                  </div>
                  <p className="text-sm mt-1 line-clamp-2">{u.message}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(u.message); toast.success("Copied"); }}>
                    <Copy className="size-4 mr-1"/>Copy
                  </Button>
                  <Button size="sm" onClick={() => sendReminder(u)}>
                    <Send className="size-4 mr-1"/>Send
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Rules */}
      <section>
        <h2 className="font-display text-lg mb-3">Reminder rules</h2>
        {rules.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No rules yet. Create one to automate reminders.</Card>
        ) : (
          <div className="grid gap-3">
            {rules.map((r) => (
              <Card key={r.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {!r.enabled && <Badge variant="secondary">Disabled</Badge>}
                    <Badge variant="outline">{TRIGGER_LABELS[r.trigger_type as Trigger]}</Badge>
                    {r.client_id ? (
                      <Badge variant="outline">{availableClients.find((c) => c.id === r.client_id)?.business_name || "Client"}</Badge>
                    ) : (
                      <Badge variant="outline">All clients</Badge>
                    )}
                    {r.channels.map((c: string) => <Badge key={c} className="capitalize">{c.replace("_", " ")}</Badge>)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{r.message_template}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditor({
                  id: r.id, clientId: r.client_id, name: r.name, triggerType: r.trigger_type,
                  offsetDays: r.offset_days, dayOfMonth: r.day_of_month, messageTemplate: r.message_template,
                  channels: r.channels, enabled: r.enabled,
                })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={async () => {
                  if (!firm || !confirm("Delete rule?")) return;
                  try { await remove({ data: { id: r.id, caFirmId: firm.id } }); toast.success("Deleted"); load(); }
                  catch (e: any) { toast.error(e.message); }
                }}><Trash2 className="size-4"/></Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="font-display text-lg mb-3">Recent reminders</h2>
        {history.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No reminders sent yet.</Card>
        ) : (
          <Card className="divide-y divide-border">
            {history.map((h: any) => (
              <div key={h.id} className="p-3 flex items-center gap-3 text-sm">
                <Badge variant="outline" className="capitalize">{h.channel.replace("_", " ")}</Badge>
                <span className="font-medium">{h.clients?.business_name ?? "—"}</span>
                <span className="text-muted-foreground truncate flex-1">{h.message}</span>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(h.created_at).toLocaleString()}</span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function RuleEditor({
  editor, setEditor, clients, onSave,
}: {
  editor: any; setEditor: (e: any) => void;
  clients: { id: string; business_name: string }[];
  onSave: () => void;
}) {
  const toggleChannel = (c: Channel) => {
    const set = new Set<Channel>(editor.channels);
    set.has(c) ? set.delete(c) : set.add(c);
    setEditor({ ...editor, channels: Array.from(set) });
  };
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{editor.id ? "Edit rule" : "New reminder rule"}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium">Name</label>
          <Input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="GST due reminder"/>
        </div>
        <div>
          <label className="text-xs font-medium">Applies to</label>
          <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={editor.clientId ?? ""}
            onChange={(e) => setEditor({ ...editor, clientId: e.target.value || null })}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium">Trigger</label>
          <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={editor.triggerType}
            onChange={(e) => setEditor({ ...editor, triggerType: e.target.value })}>
            {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {(editor.triggerType === "gst_due_offset" || editor.triggerType === "stale_upload_days") && (
          <div>
            <label className="text-xs font-medium">
              {editor.triggerType === "gst_due_offset" ? "Days before due date" : "Days of inactivity"}
            </label>
            <Input type="number" min={0} max={365}
              value={editor.offsetDays ?? ""}
              onChange={(e) => setEditor({ ...editor, offsetDays: e.target.value === "" ? null : Number(e.target.value) })}/>
          </div>
        )}
        {editor.triggerType === "monthly_day" && (
          <div>
            <label className="text-xs font-medium">Day of month (1–28)</label>
            <Input type="number" min={1} max={28}
              value={editor.dayOfMonth ?? ""}
              onChange={(e) => setEditor({ ...editor, dayOfMonth: e.target.value === "" ? null : Number(e.target.value) })}/>
          </div>
        )}
        <div>
          <label className="text-xs font-medium">Message template</label>
          <Textarea rows={3} value={editor.messageTemplate}
            onChange={(e) => setEditor({ ...editor, messageTemplate: e.target.value })}/>
          <p className="text-[11px] text-muted-foreground mt-1">Variables: <code>{"{client}"}</code> <code>{"{firm}"}</code> <code>{"{due_date}"}</code></p>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Channels</label>
          <div className="flex gap-2 flex-wrap">
            {(["in_app", "email", "whatsapp"] as Channel[]).map((c) => (
              <button key={c} type="button" onClick={() => toggleChannel(c)}
                className={`px-3 h-8 rounded-full text-xs border capitalize ${editor.channels.includes(c) ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
                {c.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={editor.enabled} onChange={(e) => setEditor({ ...editor, enabled: e.target.checked })}/>
          Enabled
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
        <Button onClick={onSave} disabled={!editor.name?.trim()}>Save rule</Button>
      </DialogFooter>
    </DialogContent>
  );
}
