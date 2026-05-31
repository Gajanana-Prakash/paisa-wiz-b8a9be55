import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ClientMessagesPanel } from "@/components/communications/ClientMessagesPanel";
import { useLanguage } from "@/hooks/useLanguage";
import {
  listClientQueries,
  createClientQuery,
  getClientQueryThread,
  replyClientQuery,
  rateClientQuery,
} from "@/lib/client-portal.functions";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function ClientQueriesPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const listFn = useServerFn(listClientQueries);
  const createFn = useServerFn(createClientQuery);
  const threadFn = useServerFn(getClientQueryThread);
  const replyFn = useServerFn(replyClientQuery);
  const rateFn = useServerFn(rateClientQuery);

  const { data: listData, isLoading } = useQuery({
    queryKey: ["client-queries"],
    queryFn: () => listFn({ data: undefined as any }),
  });

  const [newOpen, setNewOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [rating, setRating] = useState(0);

  const { data: thread, refetch: refetchThread } = useQuery({
    queryKey: ["client-query-thread", selectedId],
    queryFn: () => threadFn({ data: { queryId: selectedId! } }),
    enabled: !!selectedId,
  });

  const submitQuery = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Please add a subject and description");
      return;
    }
    setBusy(true);
    try {
      const r = await createFn({ data: { subject: subject.trim(), body: body.trim(), priority: priority as "LOW" | "NORMAL" | "HIGH" } });
      setNewOpen(false);
      setSubject("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["client-queries"] });
      setSelectedId(r.id);
      toast.success("Query submitted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selectedId || !replyText.trim()) return;
    setBusy(true);
    try {
      await replyFn({ data: { queryId: selectedId, message: replyText.trim() } });
      setReplyText("");
      refetchThread();
      qc.invalidateQueries({ queryKey: ["client-queries"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const submitRating = async () => {
    if (!selectedId || rating < 1) return;
    setBusy(true);
    try {
      await rateFn({ data: { queryId: selectedId, rating } });
      toast.success("Thank you for your feedback");
      refetchThread();
      qc.invalidateQueries({ queryKey: ["client-queries"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">{t("queries_title")}</h1>
        <p className="text-muted-foreground mt-1 leading-relaxed">{t("queries_sub")}</p>
      </div>

      <ClientMessagesPanel />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">My queries</h2>
          <Button size="lg" className="gap-2 h-11" onClick={() => setNewOpen(true)}>
            <Plus className="size-5" /> Raise new query
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-4 min-h-[320px]">
          <ul className="space-y-2 border rounded-xl p-2 bg-card max-h-[480px] overflow-y-auto">
            {(listData?.queries ?? []).length === 0 && (
              <li className="p-4 text-muted-foreground text-center">No queries yet.</li>
            )}
            {(listData?.queries ?? []).map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(q.id)}
                  className={`w-full text-left rounded-lg px-4 py-3 transition-colors ${
                    selectedId === q.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium line-clamp-1">{q.subject}</span>
                    <Badge variant="outline">{STATUS_LABEL[q.status] ?? q.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(q.created_at).toLocaleDateString("en-IN")}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="border rounded-xl bg-card flex flex-col min-h-[320px]">
            {!selectedId ? (
              <p className="m-auto text-muted-foreground p-6 text-center">Select a query to view the conversation</p>
            ) : (
              <>
                <div className="px-4 py-3 border-b font-semibold">{thread?.query?.subject}</div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[280px]">
                  {(thread?.replies ?? []).map((r) => (
                    <div
                      key={r.id}
                      className={`rounded-xl px-4 py-3 max-w-[90%] ${
                        r.isMine ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"
                      }`}
                    >
                      <p className="text-xs opacity-80 mb-1">{r.senderName}</p>
                      <p className="whitespace-pre-wrap">{r.message}</p>
                    </div>
                  ))}
                </div>
                {thread?.query?.status === "RESOLVED" && !thread?.query?.client_rating && (
                  <div className="p-4 border-t bg-muted/30 space-y-2">
                    <p className="font-medium">Was your query resolved?</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRating(n)}
                          className="p-1"
                          aria-label={`Rate ${n} stars`}
                        >
                          <Star className={`size-7 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                        </button>
                      ))}
                    </div>
                    <Button disabled={busy || rating < 1} onClick={submitRating}>
                      Submit rating
                    </Button>
                  </div>
                )}
                {thread?.query?.status !== "CLOSED" && thread?.query?.status !== "RESOLVED" && (
                  <div className="p-3 border-t flex gap-2">
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your message…"
                      className="min-h-[44px] text-base"
                      rows={2}
                    />
                    <Button disabled={busy} onClick={sendReply} className="shrink-0">
                      Send
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="text-base">
          <DialogHeader>
            <DialogTitle>Ask your CA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subject</Label>
              <Input className="h-11 mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label>What would you like to ask?</Label>
              <Textarea className="mt-1 min-h-[120px]" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button disabled={busy} onClick={submitQuery}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
