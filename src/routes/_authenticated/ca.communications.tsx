import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listFirmCommunications,
  listFollowUps,
  completeFollowUp,
} from "@/lib/communications.functions";
import { listStaff } from "@/lib/timetracking.functions";
import { listFirmClientsLite } from "@/lib/tasks.functions";
import { CHANNEL_META, formatCommTime } from "@/components/communications/utils";

export const Route = createFileRoute("/_authenticated/ca/communications")({
  component: CommunicationsHubPage,
});

function CommunicationsHubPage() {
  const qc = useQueryClient();
  const loadComms = useServerFn(listFirmCommunications);
  const loadFollowUps = useServerFn(listFollowUps);
  const complete = useServerFn(completeFollowUp);
  const loadStaff = useServerFn(listStaff);
  const loadClients = useServerFn(listFirmClientsLite);

  const [clientFilter, setClientFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data: comms = [], isLoading } = useQuery({
    queryKey: ["firm-comms", clientFilter, staffFilter, channelFilter, search],
    queryFn: () =>
      loadComms({
        data: {
          clientId: clientFilter || undefined,
          staffId: staffFilter || undefined,
          channel: channelFilter as any || undefined,
          search: search.trim() || undefined,
        },
      }),
  });

  const { data: followUps = [] } = useQuery({
    queryKey: ["follow-ups"],
    queryFn: () => loadFollowUps({ data: undefined as any }),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: () => loadStaff({ data: undefined as any }),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["firm-clients-lite"],
    queryFn: () => loadClients({ data: undefined as any }),
  });

  const handleComplete = async (id: string) => {
    try {
      await complete({ data: { callLogId: id } });
      qc.invalidateQueries({ queryKey: ["follow-ups"] });
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Communication center</h1>
        <p className="text-muted-foreground mt-1">Recent activity across all clients and pending follow-ups.</p>
      </div>

      {(followUps as any[]).length > 0 && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
          <h2 className="font-semibold text-sm">Follow-up tracker</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground text-left">
                <tr>
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Note</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3">Staff</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(followUps as any[]).map((f) => (
                  <tr key={f.id} className="border-t border-border/60">
                    <td className="py-2 pr-3 font-medium">{f.clients?.business_name}</td>
                    <td className="py-2 pr-3 text-muted-foreground max-w-xs truncate">{f.follow_up_note || f.outcome}</td>
                    <td className={`py-2 pr-3 whitespace-nowrap ${f.is_overdue ? "text-rose-700 font-medium" : f.is_due_today ? "text-amber-700" : ""}`}>
                      {f.follow_up_date ? format(new Date(f.follow_up_date), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="py-2 pr-3">{f.staff_name}</td>
                    <td className="py-2">
                      <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => handleComplete(f.id)}>
                        <Check className="size-3" /> Done
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <Input placeholder="Search messages…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs h-9" />
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm min-w-[160px]">
            <option value="">All clients</option>
            {(clients as any[]).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select>
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm min-w-[140px]">
            <option value="">All staff</option>
            {(staff as any[]).map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
          </select>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm">
            <option value="">All channels</option>
            {Object.keys(CHANNEL_META).map((ch) => (
              <option key={ch} value={ch}>{CHANNEL_META[ch as keyof typeof CHANNEL_META].label}</option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          {isLoading && (
            <div className="py-12 grid place-items-center"><Loader2 className="size-5 animate-spin" /></div>
          )}
          {!isLoading && (comms as any[]).length === 0 && (
            <p className="py-12 text-center text-muted-foreground text-sm">No communications match your filters.</p>
          )}
          {(comms as any[]).map((c) => {
            const meta = CHANNEL_META[c.channel as keyof typeof CHANNEL_META];
            return (
              <Link
                key={c.id}
                to="/ca/clients/$clientId"
                params={{ clientId: c.client_id }}
                className="block px-4 py-3 hover:bg-muted/30 transition"
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg">{meta?.emoji ?? "💬"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{c.clients?.business_name}</span>
                      <span className="text-muted-foreground text-xs">{formatCommTime(c.sent_at)}</span>
                      {c.staff_name && <span className="text-xs text-muted-foreground">· {c.staff_name}</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{c.body}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
