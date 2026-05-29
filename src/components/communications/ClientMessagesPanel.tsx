import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listClientInAppMessages,
  clientReplyMessage,
  markClientMessagesRead,
} from "@/lib/communications.functions";
import { formatCommTime } from "./utils";

export function ClientMessagesPanel() {
  const qc = useQueryClient();
  const load = useServerFn(listClientInAppMessages);
  const reply = useServerFn(clientReplyMessage);
  const markRead = useServerFn(markClientMessagesRead);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["client-in-app-messages"],
    queryFn: () => load({ data: undefined as any }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (data?.unread) markRead({ data: undefined as any }).then(() => qc.invalidateQueries({ queryKey: ["client-in-app-messages"] }));
  }, [data?.unread, markRead, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages?.length]);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await reply({ data: { body: text.trim() } });
      setText("");
      refetch();
      toast.success("Reply sent");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-5 text-primary" />
          <h2 className="font-display font-semibold">Messages from your CA</h2>
        </div>
        {(data?.unread ?? 0) > 0 && (
          <Badge className="bg-primary">{data!.unread} new</Badge>
        )}
      </div>

      <div className="h-64 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {isLoading && (
          <div className="py-8 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        )}
        {!isLoading && !data?.messages?.length && (
          <p className="text-sm text-center text-muted-foreground py-8">
            No messages yet. Your CA will reach out here when they need something from you.
          </p>
        )}
        {(data?.messages ?? []).map((m: any) => (
          <div key={m.id} className={`flex ${m.is_mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.is_mine ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-background border border-border rounded-tl-sm"
              }`}
            >
              {!m.is_mine && <div className="text-[10px] opacity-80 mb-0.5">{m.sender_label}</div>}
              <p className="whitespace-pre-wrap">{m.body}</p>
              <div className={`text-[10px] mt-1 ${m.is_mine ? "opacity-80" : "text-muted-foreground"}`}>
                {formatCommTime(m.sent_at)}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {data?.canReply ? (
        <div className="p-3 border-t border-border flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Reply to your CA…"
            rows={2}
            className="resize-none flex-1"
          />
          <Button size="icon" className="shrink-0 self-end" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground p-3 border-t border-border text-center">
          You can reply once your CA sends the first message.
        </p>
      )}
    </section>
  );
}
