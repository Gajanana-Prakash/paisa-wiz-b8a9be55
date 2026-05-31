import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientComplianceOverview } from "@/lib/client-portal.functions";

const TRAFFIC = {
  green: { emoji: "🟢", title: "All compliant", desc: "You're up to date on filings we track.", className: "border-emerald-300 bg-emerald-50/50" },
  yellow: { emoji: "🟡", title: "Action needed", desc: "Some items need your attention soon.", className: "border-amber-300 bg-amber-50/50" },
  red: { emoji: "🔴", title: "Overdue items", desc: "Please contact your CA to catch up.", className: "border-rose-300 bg-rose-50/50" },
};

export function ClientCompliancePage() {
  const load = useServerFn(getClientComplianceOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["client-compliance"],
    queryFn: () => load({ data: undefined as any }),
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const t = TRAFFIC[data?.traffic ?? "green"];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">Compliance status</h1>
        <p className="text-muted-foreground mt-1">A simple overview — no tax jargon</p>
      </div>

      <Card className={`border-2 ${t.className}`}>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-3">
            <span className="text-3xl">{t.emoji}</span>
            {t.title}
          </CardTitle>
          <p className="text-lg text-muted-foreground">{t.desc}</p>
        </CardHeader>
      </Card>

      {!!data?.openNotices && data.openNotices > 0 && (
        <Card className="border-amber-400">
          <CardContent className="pt-6 text-lg">
            You have {data.openNotices} pending notice{data.openNotices > 1 ? "s" : ""} —{" "}
            <Link to="/client/dashboard/queries" className="text-primary font-medium underline">
              contact your CA
            </Link>
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Upcoming deadlines</h2>
        <ul className="space-y-3">
          {(data?.upcoming ?? []).length === 0 && (
            <li className="text-muted-foreground">No upcoming deadlines right now.</li>
          )}
          {(data?.upcoming ?? []).map((u) => (
            <li key={u.id} className="rounded-xl border bg-card px-4 py-4 text-base">
              {u.plainText}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Completed this year</h2>
        <ul className="space-y-2">
          {(data?.completed ?? []).length === 0 && (
            <li className="text-muted-foreground">No completed filings yet this year.</li>
          )}
          {(data?.completed ?? []).map((c, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/40 px-4 py-3">
              <span>{c.label}</span>
              <span className="text-emerald-700 font-medium">Filed {c.filedOn}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
