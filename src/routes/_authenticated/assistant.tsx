import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/assistant.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assistant")({ component: Assistant });

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What's my total IGST liability this quarter?",
  "Which vendors have the highest GST input?",
  "List invoices flagged for review.",
  "Summarize my CGST and SGST for last month.",
];

function Assistant() {
  const ask = useServerFn(askAssistant);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async (q: string) => {
    if (!q.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await ask({ data: { question: q } });
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Assistant unavailable");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col h-screen">
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-lg bg-primary/10 grid place-items-center text-primary"><Sparkles className="size-4"/></div>
          <h1 className="font-display text-3xl font-semibold">AI Assistant</h1>
        </div>
        <p className="text-muted-foreground mt-1">Ask questions in plain English. Get instant answers from your own invoice data.</p>
      </div>

      <div className="mt-6 flex-1 overflow-y-auto rounded-2xl border border-border bg-card p-6 space-y-4">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-muted-foreground">Try asking:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-sm px-3 py-2 rounded-full border border-border hover:border-primary/40 hover:bg-secondary/50 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-foreground"}`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="rounded-2xl px-4 py-3 bg-secondary/60 text-muted-foreground text-sm flex items-center gap-2"><Loader2 className="size-4 animate-spin"/>Analyzing your invoices…</div></div>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-4 flex items-end gap-2 shrink-0">
        <Textarea value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask about your GST data…" className="min-h-[52px] max-h-40" />
        <Button type="submit" disabled={loading || !input.trim()} size="lg"><Send className="size-4"/></Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground shrink-0">AI-assisted. Always verify numbers before filing.</p>
    </div>
  );
}