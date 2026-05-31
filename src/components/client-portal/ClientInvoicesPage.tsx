import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getClientInvoicesPortal } from "@/lib/client-portal.functions";
import { formatInr } from "@/components/billing/utils";
import { PaymentModal } from "./PaymentModal";
import { useLanguage } from "@/hooks/useLanguage";

export function ClientInvoicesPage() {
  const { t } = useLanguage();
  const load = useServerFn(getClientInvoicesPortal);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["client-invoices-portal"],
    queryFn: () => load({ data: undefined as any }),
  });
  const [payInvoice, setPayInvoice] = useState<any>(null);

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">{t("invoices")}</h1>
        <p className="text-muted-foreground mt-1 leading-relaxed">{t("invoices_sub")}</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Outstanding</h2>
        {(data?.outstanding ?? []).length === 0 && (
          <p className="text-muted-foreground rounded-xl border bg-card p-6">No outstanding invoices. You&apos;re all caught up.</p>
        )}
        {(data?.outstanding ?? []).map((inv) => {
          const overdue = inv.due_date < today;
          return (
            <Card key={inv.id} className={overdue ? "border-rose-300" : ""}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-lg">{inv.invoice_number}</CardTitle>
                  {inv.proofPending && (
                    <Badge variant="secondary">Proof submitted — pending confirmation</Badge>
                  )}
                </div>
                {inv.period_label && <p className="text-muted-foreground">{inv.period_label}</p>}
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="text-sm space-y-1">
                  {(inv.items ?? []).map((it: { description: string; total: number }, i: number) => (
                    <li key={i} className="flex justify-between">
                      <span>{it.description}</span>
                      <span>{formatInr(Number(it.total))}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-end justify-between gap-4 pt-2 border-t">
                  <div>
                    <p className="text-2xl font-semibold">{formatInr(Number(inv.balance_due))}</p>
                    <p className={`text-sm ${overdue ? "text-rose-600 font-medium" : "text-muted-foreground"}`}>
                      Due {new Date(inv.due_date).toLocaleDateString("en-IN")}
                      {overdue && " (overdue)"}
                    </p>
                  </div>
                  <Button size="lg" className="h-12 px-8" onClick={() => setPayInvoice(inv)} disabled={inv.proofPending}>
                    Pay now
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Payment history</h2>
        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid on</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.payments ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No payments recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {(data?.payments ?? []).map((p: any) => {
                const inv = p.ca_invoices;
                const confirmed = true;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{inv?.invoice_number ?? "—"}</TableCell>
                    <TableCell>{inv?.period_label ?? "—"}</TableCell>
                    <TableCell>{formatInr(Number(p.amount))}</TableCell>
                    <TableCell>
                      {p.payment_date
                        ? new Date(p.payment_date).toLocaleDateString("en-IN")
                        : new Date(p.created_at).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>{p.payment_mode ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={confirmed ? "default" : "secondary"}>
                        {confirmed ? "Confirmed" : "Pending verification"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <PaymentModal
        invoice={payInvoice}
        billing={data?.billing ?? null}
        open={!!payInvoice}
        onOpenChange={(v) => !v && setPayInvoice(null)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["client-invoices-portal"] })}
      />
    </div>
  );
}
