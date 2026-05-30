import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Pin, PinOff, Paperclip, Send, Loader2, ChevronDown, ChevronUp, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import {
  listClientTimeline,
  createConversation,
  toggleConversationPin,
  addConversationAttachment,
  type TimelineItem,
} from "@/lib/communications.functions";
import { LogCallDialog } from "./LogCallDialog";
import {
  CHANNEL_FILTERS,
  CHANNEL_META,
  formatCommTime,
  initials,
  isNeutralCard,
  type CommChannel,
} from "./utils";

type ComposeMode = "NOTE" | "IN_APP" | "WHATSAPP" | "EMAIL" | "CALL";

export function ClientCommunicationPanel({ clientId }: { clientId: string }) {
  const { firm } = useTenant();
  const qc = useQueryClient();
  const loadTimeline = useServerFn(listClientTimeline);
  const create = useServerFn(createConversation);
  const togglePin = useServerFn(toggleConversationPin);
  const addAtt = useServerFn(addConversationAttachment);
  const fileRef = useRef<HTMLInputElement>(null);

  const [channelFilter, setChannelFilter] = useState<CommChannel>("ALL");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [compose, setCompose] = useState("");
  const [mode, setMode] = useState<ComposeMode>("NOTE");
  const [busy, setBusy] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(true);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["client-timeline", clientId, channelFilter],
    queryFn: () =>
      loadTimeline({
        data: { clientId, channel: channelFilter === "ALL" ? undefined : channelFilter },
      }),
  });

  const timeline = useMemo(() => {
    const items = data?.timeline ?? [];
    if (channelFilter === "ALL") return items;
    return items.filter((t) => t.channel === channelFilter);
  }, [data, channelFilter]);

  const counts = data?.counts ?? {};

  const handleSend = useCallback(async () => {
    if (mode === "CALL") {
      setCallOpen(true);
      return;
    }
    if (!compose.trim()) {
      toast.error("Enter a message");
      return;
    }
    setBusy(true);
    try {
      const channel = mode === "NOTE" ? "NOTE" : mode === "IN_APP" ? "IN_APP" : mode;
      const direction = mode === "NOTE" ? "INTERNAL_NOTE" : "OUTBOUND";
      await create({
        data: {
          clientId,
          channel: channel as any,
          direction: direction as any,
          body: compose.trim(),
        },
      });
      setCompose("");
      qc.invalidateQueries({ queryKey: ["client-timeline", clientId] });
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }, [mode, compose, clientId, create, qc]);

  const handlePin = async (item: TimelineItem) => {
    if (item.kind !== "conversation" || item.id.startsWith("call-")) return;
    try {
      await togglePin({ data: { id: item.id, pinned: !item.is_pinned } });
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const uploadFile = async (file: File, conversationId: string) => {
    if (!firm) return;
    const path = `${firm.id}/${clientId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("communication-attachments").upload(path, file);
    if (error) throw error;
    const { data: signed } = await supabase.storage.from("communication-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
    await addAtt({
      data: {
        conversationId,
        fileUrl: signed?.signedUrl ?? path,
        fileName: file.name,
        fileSize: file.size,
      },
    });
  };

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !compose.trim()) {
      toast.error("Write a message first, then attach");
      return;
    }
    setBusy(true);
    try {
      const { id } = await create({
        data: { clientId, channel: mode === "WHATSAPP" ? "WHATSAPP" : "NOTE", direction: "OUTBOUND", body: compose.trim() },
      });
      await uploadFile(file, id);
      setCompose("");
      refetch();
      toast.success("Uploaded");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <div className="grid lg:grid-cols-[minmax(220px,30%)_1fr] gap-4 min-h-[520px]">
      {/* Left panel */}
      <aside className="rounded-2xl border border-border bg-card p-4 space-y-4 h-fit lg:sticky lg:top-20">
        <Button size="sm" className="w-full gap-1.5" onClick={() => setLogOpen(true)}>
          <Plus className="size-4" /> Log communication
        </Button>
        <div className="space-y-1">
          {CHANNEL_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setChannelFilter(f.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                channelFilter === f.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"
              }`}
            >
              <span>{f.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{counts[f.id] ?? (f.id === "ALL" ? timeline.length : 0)}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Right panel */}
      <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden min-h-[520px]">
        {(data?.pinned?.length ?? 0) > 0 && (
          <Collapsible open={pinnedOpen} onOpenChange={setPinnedOpen} className="border-b border-border bg-amber-500/5">
            <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium">
              <span className="flex items-center gap-2"><Pin className="size-3.5 text-amber-600" /> Pinned ({data!.pinned.length})</span>
              {pinnedOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-3 space-y-2">
              {data!.pinned.map((item) => (
                <PinnedSnippet key={item.id} item={item} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[320px]">
          {isLoading && (
            <div className="py-16 grid place-items-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
          {!isLoading && timeline.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-16">No communication logged yet.</p>
          )}
          {timeline.map((item) => (
            <TimelineCard
              key={item.id}
              item={item}
              expanded={!!expanded[item.id]}
              onToggle={() => setExpanded((e) => ({ ...e, [item.id]: !e[item.id] }))}
              onPin={() => handlePin(item)}
            />
          ))}
        </div>

        {/* Compose */}
        <div className="border-t border-border p-3 bg-muted/20 space-y-2">
          <div className="flex flex-wrap gap-1">
            {(
              [
                { id: "NOTE", label: "Note" },
                { id: "IN_APP", label: "In-App" },
                { id: "WHATSAPP", label: "WhatsApp log" },
                { id: "EMAIL", label: "Email log" },
                { id: "CALL", label: "Log call" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-2.5 py-1 rounded-full text-xs border transition ${
                  mode === m.id ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode !== "CALL" && (
            <Textarea
              value={compose}
              onChange={(e) => setCompose(e.target.value)}
              placeholder={
                mode === "NOTE"
                  ? "Internal note (not visible to client)…"
                  : mode === "IN_APP"
                    ? "Message to client portal…"
                    : "Summary of conversation…"
              }
              rows={2}
              className="resize-none bg-background"
            />
          )}
          <div className="flex justify-between gap-2">
            <div>
              {mode !== "CALL" && (
                <>
                  <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleAttach} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()} title="Attach file">
                    <Paperclip className="size-4" />
                  </Button>
                </>
              )}
            </div>
            <Button size="sm" className="gap-1.5" disabled={busy} onClick={handleSend}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {mode === "CALL" ? "Open call form" : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <LogCallDialog open={callOpen || logOpen} onOpenChange={(v) => { setCallOpen(v); setLogOpen(v); }} clientId={clientId} onSaved={() => refetch()} />
    </div>
  );
}

function PinnedSnippet({ item }: { item: TimelineItem }) {
  return (
    <div className="text-xs border-l-4 border-amber-400 pl-2 py-1 bg-background rounded-r-lg">
      <span className="text-muted-foreground">{formatCommTime(item.sent_at)} · </span>
      {item.body.slice(0, 120)}
      {item.body.length > 120 ? "…" : ""}
    </div>
  );
}

function TimelineCard({
  item,
  expanded,
  onToggle,
  onPin,
}: {
  item: TimelineItem;
  expanded: boolean;
  onToggle: () => void;
  onPin: () => void;
}) {
  const meta = CHANNEL_META[item.channel as keyof typeof CHANNEL_META] ?? CHANNEL_META.NOTE;
  const neutral = isNeutralCard(item.channel);
  const isInbound = item.direction === "INBOUND";
  const long = item.body.length > 220;
  const showBody = !long || expanded;

  if (neutral) {
    return (
      <div className={`rounded-xl border border-border bg-muted/40 p-4 ${item.is_pinned ? "border-l-4 border-l-amber-400" : ""}`}>
        <div className="flex items-start gap-3">
          <span className="text-lg">{meta.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{item.sender_name ?? "Staff"}</span>
              <span>· {meta.label}</span>
              <span>· {formatCommTime(item.sent_at)}</span>
            </div>
            <p className="text-sm mt-2 whitespace-pre-wrap">{showBody ? item.body : `${item.body.slice(0, 220)}…`}</p>
            {long && (
              <button type="button" className="text-xs text-primary mt-1" onClick={onToggle}>
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
            {item.linked_task_id && (
              <Link to="/ca/tasks" className="text-xs text-primary mt-2 inline-block">View linked task →</Link>
            )}
            {item.attachments?.map((a) => (
              <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer" className="block text-xs text-primary mt-1 truncate">
                📎 {a.file_name}
              </a>
            ))}
          </div>
          {item.kind === "conversation" && !item.id.startsWith("call-") && (
            <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={onPin}>
              {item.is_pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isInbound ? "bg-muted rounded-tl-sm" : "bg-primary/10 rounded-tr-sm"
        } ${item.is_pinned ? "ring-2 ring-amber-400/50" : ""}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="size-7 rounded-full bg-primary/20 text-primary text-[10px] font-semibold grid place-items-center">
            {initials(item.sender_name)}
          </div>
          <div className="text-xs text-muted-foreground min-w-0">
            <span className="font-medium text-foreground">{item.sender_name}</span>
            <span className="mx-1">{meta.emoji}</span>
            <span>{formatCommTime(item.sent_at)}</span>
          </div>
          {item.kind === "conversation" && !item.id.startsWith("call-") && (
            <Button size="icon" variant="ghost" className="size-6 ml-auto" onClick={onPin}>
              {item.is_pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
            </Button>
          )}
        </div>
        {item.subject && <div className="text-xs font-medium mb-1">{item.subject}</div>}
        <p className="text-sm whitespace-pre-wrap">{showBody ? item.body : `${item.body.slice(0, 220)}…`}</p>
        {long && (
          <button type="button" className="text-xs text-primary mt-1" onClick={onToggle}>
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        {item.attachments?.map((a) => (
          <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 mt-2 text-xs text-primary">
            📎 {a.file_name}
          </a>
        ))}
      </div>
    </div>
  );
}
