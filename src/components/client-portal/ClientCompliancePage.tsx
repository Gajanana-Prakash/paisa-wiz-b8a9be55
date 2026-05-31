import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientComplianceOverview } from "@/lib/client-portal.functions";
import { useLanguage } from "@/hooks/useLanguage";

export function ClientCompliancePage() {
  const { t } = useLanguage();
  const load = useServerFn(getClientComplianceOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["client-compliance"],
    queryFn: () => load({ data: undefined as any }),
  });

  const trafficKey = data?.traffic ?? "green";
  const traffic = {
    emoji: trafficKey === "green" ? "🟢" : trafficKey === "yellow" ? "🟡" : "🔴",
    title: t(`traffic_${trafficKey}`),
    desc: t(`traffic_${trafficKey}_desc`),
    className:
      trafficKey === "green"
        ? "border-emerald-300 bg-emerald-50/50"
        : trafficKey === "yellow"
          ? "border-amber-300 bg-amber-50/50"
          : "border-rose-300 bg-rose-50/50",
  };

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">{t("compliance_title")}</h1>
        <p className="text-muted-foreground mt-1 leading-relaxed">{t("compliance_sub")}</p>
      </div>

      <Card className={`border-2 ${traffic.className}`}>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-3 leading-relaxed">
            <span className="text-3xl">{traffic.emoji}</span>
            {traffic.title}
          </CardTitle>
          <p className="text-lg text-muted-foreground leading-relaxed">{traffic.desc}</p>
        </CardHeader>
      </Card>

      {!!data?.openNotices && data.openNotices > 0 && (
        <Card className="border-amber-400">
          <CardContent className="pt-6 text-lg leading-relaxed">
            {t("pending_notice")}{" "}
            <Link to="/client/dashboard/queries" className="text-primary font-medium underline">
              →
            </Link>
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">{t("upcoming_deadlines")}</h2>
        <ul className="space-y-3">
          {(data?.upcoming ?? []).length === 0 && (
            <li className="text-muted-foreground leading-relaxed">{t("no_upcoming")}</li>
          )}
          {(data?.upcoming ?? []).map((u) => (
            <li key={u.id} className="rounded-xl border bg-card px-4 py-4 text-base leading-relaxed">
              {u.plainText}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">{t("completed_year")}</h2>
        <ul className="space-y-2">
          {(data?.completed ?? []).length === 0 && (
            <li className="text-muted-foreground">{t("no_completed")}</li>
          )}
          {(data?.completed ?? []).map((c, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/40 px-4 py-3 leading-relaxed">
              <span>{c.label}</span>
              <span className="text-emerald-700 font-medium">
                {c.filedOn}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
