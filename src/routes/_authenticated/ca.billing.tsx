import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Eye, Pencil, Send, CreditCard, FileDown, Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getBillingDashboard,
  listCaInvoices,
  sendCaInvoice,
  processBillingAutomations,
} from "@/lib/billing.functions";
import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { RecordPaymentDialog } from "@/components/billing/RecordPaymentDialog";
import { formatInr, whatsappLink, mailtoLink } from "@/components/billing/utils";

export const Route = createFileRoute("/_authenticated/ca/billing")({ component: BillingDashboard });

function BillingDashboard() {
  const qc = useQueryClient();
  const loadDash = useServerFn(getBillingDashboard);
  const loadInvoices = useServerFn(listCaInvoices);
  const send = useServerFn(sendCaInvoice);
  const runAuto = useServerFn(processBillingAutomations);

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [payInvoice, setPayInvoice] = useState<any>(null);

  const { data: dash } = useQuery({
    queryKey: ["billing-dashboard"],
    queryFn: () => loadDash({ data: undefined as any }),
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["ca-invoices", statusFilter, search],
    queryFn: () =>
      loadInvoices({
        data: {
          status: statusFilter as any || undefined,
          search: search.trim() || undefined,
        },
      }),
  });

  const handleSend = async (id: string) => {
    try {
      await send({ data: { id } });
      qc.invalidateQueries({ queryKey: ["ca-invoices"] });
      toast.success("Invoice marked as sent");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReminders = async () => {
    try {
      const res = await runAuto({ data: undefined as any });
      const list = res.reminders ?? [];
      if (!list.length) {
        toast.info("No reminders due right now");
        return;
      }
      const first = list[0];
      if (first.phone) window.open(whatsappLink(first.phone, first.message), "_blank");
      else if (first.email) {
        const m = mailtoLink(first.email, `Payment reminder: ${first.invoiceNumber}`, first.message);
        if (m) window.location.href = m;
      }
      toast.success(`${list.length} reminder(s) ready — opened first client channel`);
      qc.invalidateQueries({ queryKey: ["ca-invoices"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const cards = useMemo(
    () => [
      { label: "Invoiced this month", value: formatInr(dash?.invoicedMonth ?? 0), tone: "" },
      { label: "Collected this month", value: formatInr(dash?.collectedMonth ?? 0), tone: "text-emerald-700" },
      { label: "Outstanding", value: formatInr(dash?.outstanding ?? 0), tone: "text-rose-700" },
      { label: "Overdue invoices", value: String(dash?.overdueCount ?? 0), tone: "text-rose-700" },
    ],
    [dash],
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Billing</h1>
          <p className="text-muted-foreground mt-1">Fee invoices, payments, and collections for your clients.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReminders}>
            <Bell className="size-4" /> Run reminders
          </Button>
          <Link to="/ca/billing/new">
            <Button size="sm" className="gap-1.5"><Plus className="size-4" /> New invoice</Button>
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className={`text-2xl font-semibold tabular-nums mt-1 ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Search invoice # or client…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All statuses</option>
          {["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <Link to="/ca/billing/services" className="text-sm text-primary hover:underline pb-2">Service catalog</Link>
        <Link to="/ca/billing/reports" className="text-sm text-primary hover:underline pb-2">Reports</Link>
        <Link to="/ca/settings/billing" className="text-sm text-primary hover:underline pb-2">Billing settings</Link>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Invoice #</th>
                <th className="px-3 py-2.5">Client</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Due</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-3 py-2.5 text-right">Paid</th>
                <th className="px-3 py-2.5 text-right">Balance</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="px-3 py-12 text-center"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              )}
              {!isLoading && (invoices as any[]).length === 0 && (
                <tr><td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">No invoices yet.</td></tr>
              )}
              {(invoices as any[]).map((inv) => (
                <tr key={inv.id} className="border-t border-border even:bg-muted/20">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{inv.invoice_number}</td>
                  <td className="px-3 py-2">{inv.clients?.business_name}</td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{format(new Date(inv.invoice_date), "dd MMM yy")}</td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{format(new Date(inv.due_date), "dd MMM yy")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatInr(Number(inv.total_amount))}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatInr(Number(inv.amount_paid))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatInr(Number(inv.balance_due))}</td>
                  <td className="px-3 py-2"><InvoiceStatusBadge status={inv.status} /></td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-0.5">
                      <Link to="/ca/billing/$invoiceId" params={{ invoiceId: inv.id }}>
                        <Button size="icon" variant="ghost" className="size-7" title="View"><Eye className="size-3.5" /></Button>
                      </Link>
                      {inv.status === "DRAFT" && (
                        <Link to="/ca/billing/$invoiceId/edit" params={{ invoiceId: inv.id }}>
                          <Button size="icon" variant="ghost" className="size-7" title="Edit"><Pencil className="size-3.5" /></Button>
                        </Link>
                      )}
                      {inv.status === "DRAFT" && (
                        <Button size="icon" variant="ghost" className="size-7" title="Send" onClick={() => handleSend(inv.id)}><Send className="size-3.5" /></Button>
                      )}
                      {Number(inv.balance_due) > 0 && inv.status !== "DRAFT" && inv.status !== "CANCELLED" && (
                        <Button size="icon" variant="ghost" className="size-7" title="Record payment" onClick={() => setPayInvoice(inv)}><CreditCard className="size-3.5" /></Button>
                      )}
                      <Link to="/ca/billing/$invoiceId" params={{ invoiceId: inv.id }} search={{ print: "1" }}>
                        <Button size="icon" variant="ghost" className="size-7" title="PDF"><FileDown className="size-3.5" /></Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RecordPaymentDialog open={!!payInvoice} onOpenChange={(v) => !v && setPayInvoice(null)} invoice={payInvoice} />
    </div>
  );
}
