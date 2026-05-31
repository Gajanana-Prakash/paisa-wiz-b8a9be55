import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload, MessageCircle, CreditCard, Download, CheckCircle2, AlertTriangle, XCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientPortalHome } from "@/lib/client-portal.functions";
import { formatInr } from "@/components/billing/utils";
import { useLanguage } from "@/hooks/useLanguage";

function GstBadge({ status }: { status: "ready" | "pending" | "issue" }) {
  const { t } = useLanguage();
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
        <CheckCircle2 className="size-5" /> {t("status_ready")}
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
        <AlertTriangle className="size-5" /> {t("status_pending")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-rose-700 font-medium">
      <XCircle className="size-5" /> {t("status_issue")}
    </span>
  );
}

export function ClientHomePage() {
  const { t, formatDate } = useLanguage();
  const load = useServerFn(getClientPortalHome);
  const { data, isLoading } = useQuery({
    queryKey: ["client-portal-home"],
    queryFn: () => load({ data: undefined as any }),
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const name = data?.client?.contact_name || data?.client?.business_name || "there";
  const firmName = data?.firm?.name ?? "your CA";

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <CardHeader>
          <CardTitle className="text-2xl font-display">
            {t("welcome")}, {name}
          </CardTitle>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {t("managed_by")}{" "}
            <span className="font-medium text-foreground">{firmName}</span>
          </p>
        </CardHeader>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-1">{t("gst_filing_month")}</p>
            <GstBadge status={data?.summary?.gstStatus ?? "pending"} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex flex-col gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{t("documents_requested")}</p>
              <p className="text-2xl font-semibold">{data?.summary?.pendingDocRequests ?? 0}</p>
            </div>
            {(data?.summary?.pendingDocRequests ?? 0) > 0 && (
              <Button asChild size="lg" className="w-full sm:w-auto min-h-12">
                <Link to="/client/upload">{t("upload_button")}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex flex-col gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{t("outstanding_fees")}</p>
              <p className="text-2xl font-semibold">{formatInr(data?.summary?.outstandingFees ?? 0)}</p>
            </div>
            {(data?.summary?.outstandingFees ?? 0) > 0 && (
              <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto min-h-12">
                <Link to="/client/dashboard/invoices">{t("pay_now")}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-1">{t("next_due")}</p>
            {data?.summary?.nextDue ? (
              <p className="text-lg font-medium leading-relaxed">
                {data.summary.nextDue.label} — {formatDate(data.summary.nextDue.date)}
              </p>
            ) : (
              <p className="text-lg text-muted-foreground">{t("nothing_due_soon")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold mb-4">{t("recent_activity")}</h2>
        <ul className="space-y-3">
          {(data?.activity ?? []).length === 0 && (
            <li className="text-muted-foreground">{t("no_recent_activity")}</li>
          )}
          {(data?.activity ?? []).map((a, i) => (
            <li key={i} className="rounded-xl border bg-card px-4 py-3 text-base leading-relaxed">
              {a.link ? (
                <Link to={a.link} className="hover:text-primary transition-colors">
                  {a.text}
                </Link>
              ) : (
                a.text
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold mb-4">{t("quick_actions")}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { to: "/client/upload", icon: Upload, label: t("upload_docs") },
            { to: "/client/dashboard/queries", icon: MessageCircle, label: t("ask_ca") },
            { to: "/client/dashboard/invoices", icon: CreditCard, label: t("pay_fees") },
            { to: "/client/dashboard/filings", icon: Download, label: t("download_reports") },
          ].map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card p-5 hover:border-primary hover:bg-primary/5 transition-colors text-center min-h-[128px]"
            >
              <a.icon className="size-8 text-primary" />
              <span className="font-medium leading-snug px-1">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
