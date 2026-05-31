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

function GstBadge({ status }: { status: "ready" | "pending" | "issue" }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
        <CheckCircle2 className="size-5" /> Ready
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
        <AlertTriangle className="size-5" /> Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-rose-700 font-medium">
      <XCircle className="size-5" /> Needs attention
    </span>
  );
}

export function ClientHomePage() {
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
            Welcome back, {name}
          </CardTitle>
          <p className="text-muted-foreground text-lg">
            Managed by <span className="font-medium text-foreground">{firmName}</span>
          </p>
        </CardHeader>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-1">GST filing this month</p>
            <GstBadge status={data?.summary?.gstStatus ?? "pending"} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex flex-col gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Documents requested</p>
              <p className="text-2xl font-semibold">{data?.summary?.pendingDocRequests ?? 0}</p>
            </div>
            {(data?.summary?.pendingDocRequests ?? 0) > 0 && (
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/client/upload">Upload now</Link>
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex flex-col gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Outstanding fees</p>
              <p className="text-2xl font-semibold">{formatInr(data?.summary?.outstandingFees ?? 0)}</p>
            </div>
            {(data?.summary?.outstandingFees ?? 0) > 0 && (
              <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                <Link to="/client/dashboard/invoices">Pay now</Link>
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-1">Next filing due</p>
            {data?.summary?.nextDue ? (
              <p className="text-lg font-medium">
                {data.summary.nextDue.label} —{" "}
                {new Date(data.summary.nextDue.date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            ) : (
              <p className="text-lg text-muted-foreground">Nothing due soon</p>
            )}
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold mb-4">Recent activity</h2>
        <ul className="space-y-3">
          {(data?.activity ?? []).length === 0 && (
            <li className="text-muted-foreground">No recent activity yet.</li>
          )}
          {(data?.activity ?? []).map((a, i) => (
            <li key={i} className="rounded-xl border bg-card px-4 py-3 text-base">
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
        <h2 className="font-display text-xl font-semibold mb-4">Quick actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { to: "/client/upload", icon: Upload, label: "Upload documents" },
            { to: "/client/dashboard/queries", icon: MessageCircle, label: "Ask my CA" },
            { to: "/client/dashboard/invoices", icon: CreditCard, label: "Pay fees" },
            { to: "/client/dashboard/filings", icon: Download, label: "Download reports" },
          ].map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card p-6 hover:border-primary hover:bg-primary/5 transition-colors text-center min-h-[120px]"
            >
              <a.icon className="size-8 text-primary" />
              <span className="font-medium">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
