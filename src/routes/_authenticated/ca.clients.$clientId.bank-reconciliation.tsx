import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Upload, Loader2, FileDown, Search, FileText, AlertTriangle, Wand2 } from "lucide-react";
import {
  uploadBankStatement, parseAndStageStatement, listStatements, getStatementDashboard,
  confirmMatch, bulkConfirm, rejectMatch, manualMatch, excludeTxn, addTxnNote,
  searchInvoicesForMatch, downloadReconciliationReport,
} from "@/lib/bank.functions";
import { MatchStatusBadge, CategoryBadge, ConfidencePill, TxnAmount } from "@/components/bank/StatusBadges";

export const Route = createFileRoute("/_authenticated/ca/clients/$clientId/bank-reconciliation")({
  component: BankReconPage,
});

function BankReconPage() {
  const { clientId } = Route.useParams();
  const uploadFn = useServerFn(uploadBankStatement);
  const parseFn = useServerFn(parseAndStageStatement);
  const listFn = useServerFn(listStatements);
  const dashFn = useServerFn(getStatementDashboard);
  const downloadFn = useServerFn(downloadReconciliationReport);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);

  const statementsQ = useQuery({
    queryKey: ["bank-statements", clientId],
    queryFn: () => listFn({ data: { clientId } }),
  });

  const dashQ = useQuery({
    queryKey: ["bank-dash", selectedId],
    queryFn: () => dashFn({ data: { statementId: selectedId! } }),
    enabled: !!selectedId,
  });

  async function handleUpload(file: File, accountNumber: string, accountType: string) {
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
      }
      const res = await uploadFn({
        data: {
          clientId,
          fileName: file.name,
          fileBase64: btoa(bin),
          accountNumber,
          accountType: accountType as any,
        },
      });
      toast.success("Statement uploaded. Parsing…");
      setSelectedId(res.statementId);
      setParsing(true);
      const r = await parseFn({ data: { statementId: res.statementId } });
      toast.success(`Parsed ${r.txnCount} transactions, ${r.reconciled} auto-matched`);
      statementsQ.refetch();
      dashQ.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Upload/parse failed");
    } finally {
      setUploading(false);
      setParsing(false);
    }
  }

  async function handleDownload() {
    if (!selectedId) return;
    const r = await downloadFn({ data: { statementId: selectedId } });
    const link = document.createElement("a");
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${r.base64}`;
    link.download = r.filename;
    link.click();
  }

  const statements = statementsQ.data?.statements || [];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/ca/clients/$clientId" params={{ clientId }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="size-3" /> Back to client
          </Link>
          <h1 className="font-display text-2xl font-semibold mt-1">Bank Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload bank statements and auto-match transactions to invoices.
          </p>
        </div>
        {selectedId && (
          <Button variant="outline" onClick={handleDownload} className="gap-2">
            <FileDown className="size-4" /> Download Report
          </Button>
        )}
      </div>

      {/* Statement selector */}
      {statements.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-xs uppercase text-muted-foreground">Statement:</Label>
          <Select value={selectedId ?? ""} onValueChange={(v) => setSelectedId(v)}>
            <SelectTrigger className="w-[420px]"><SelectValue placeholder="Select a statement…" /></SelectTrigger>
            <SelectContent>
              {statements.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.bank_name} • {s.statement_period_from ?? "?"} → {s.statement_period_to ?? "?"} • {s.transaction_count} txns
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Empty state / upload */}
      {!selectedId && (
        <UploadZone onUpload={handleUpload} uploading={uploading || parsing} />
      )}

      {selectedId && dashQ.isLoading && (
        <div className="p-8 grid place-items-center"><Loader2 className="size-5 animate-spin text-primary" /></div>
      )}

      {selectedId && dashQ.data && (
        <ReconDashboard
          clientId={clientId}
          statementId={selectedId}
          data={dashQ.data}
          onRefetch={() => dashQ.refetch()}
        />
      )}
    </div>
  );
}

function UploadZone({ onUpload, uploading }: { onUpload: (f: File, acct: string, type: string) => void; uploading: boolean }) {
  const [account, setAccount] = useState("");
  const [accountType, setAccountType] = useState("CURRENT");
  return (
    <div className="bg-card border border-border rounded-3xl p-10 md:p-16 text-center">
      <div className="mx-auto size-16 rounded-2xl bg-primary/10 grid place-items-center mb-4">
        <Upload className="size-7 text-primary" />
      </div>
      <h2 className="font-display text-xl font-semibold">Upload Bank Statement</h2>
      <p className="text-sm text-muted-foreground mt-2">Supports HDFC, SBI, ICICI, Axis, Kotak and other major Indian banks.</p>
      <p className="text-xs text-muted-foreground">PDF, Excel, or CSV format.</p>

      <div className="mt-6 max-w-md mx-auto grid gap-3 text-left">
        <div>
          <Label className="text-xs">Account number (last 4 digits)</Label>
          <Input maxLength={4} value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))} placeholder="1234" />
        </div>
        <div>
          <Label className="text-xs">Account type</Label>
          <Select value={accountType} onValueChange={setAccountType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CURRENT">Current</SelectItem>
              <SelectItem value="SAVINGS">Savings</SelectItem>
              <SelectItem value="OD">Overdraft</SelectItem>
              <SelectItem value="CC">Cash Credit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="mt-2">
          <Button className="w-full gap-2" disabled={uploading} asChild>
            <span>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {uploading ? "Parsing…" : "Choose file"}
            </span>
          </Button>
          <input
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f, account, accountType);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

function ReconDashboard({
  clientId, statementId, data, onRefetch,
}: { clientId: string; statementId: string; data: any; onRefetch: () => void }) {
  const stmt = data.statement;
  const txns: any[] = data.transactions || [];
  const invoices: any[] = data.invoices || [];
  const invById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const i of invoices) m[i.id] = i;
    return m;
  }, [invoices]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matchTxn, setMatchTxn] = useState<any | null>(null);
  const [noteTxn, setNoteTxn] = useState<any | null>(null);

  const confirmFn = useServerFn(confirmMatch);
  const rejectFn = useServerFn(rejectMatch);
  const excludeFn = useServerFn(excludeTxn);
  const bulkFn = useServerFn(bulkConfirm);

  const total = stmt.transaction_count || txns.length;
  const matched = txns.filter((t) => t.matched_invoice_id).length;
  const needsReview = txns.filter(
    (t) => !t.matched_invoice_id && t.match_confidence != null && t.match_confidence > 0,
  ).length;
  const unmatched = txns.filter(
    (t) => t.reconciliation_status === "UNMATCHED" && !t.matched_invoice_id && (t.match_confidence == null || t.match_confidence === 0),
  ).length;
  const pct = total ? Math.round((matched / total) * 100) : 0;

  const toggle = (id: string) => {
    const ns = new Set(selected);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setSelected(ns);
  };

  async function handleBulk() {
    if (!selected.size) return;
    await bulkFn({ data: { transactionIds: Array.from(selected) } });
    toast.success(`Confirmed ${selected.size} matches`);
    setSelected(new Set());
    onRefetch();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Transactions" value={total} />
        <SummaryCard label="Auto-Matched" value={matched} color="text-green-700" />
        <SummaryCard label="Needs Review" value={needsReview} color="text-amber-700" />
        <SummaryCard label="Unmatched" value={unmatched} color="text-red-700" />
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Reconciliation progress</span>
          <span className="text-sm font-mono">{pct}%</span>
        </div>
        <Progress value={pct} />
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 bg-primary text-primary-foreground px-4 py-2 rounded-xl flex items-center justify-between shadow-lg">
          <span className="text-sm">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="sm" variant="secondary" onClick={handleBulk}>Confirm Selected</Button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 w-8"></th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Description</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Matched Invoice</th>
                <th className="p-3 text-right">Confidence</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {txns.length === 0 && (
                <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">No transactions parsed. Check parse_error in the statement record.</td></tr>
              )}
              {txns.map((t) => {
                const inv = t.matched_invoice_id ? invById[t.matched_invoice_id] : null;
                return (
                  <tr key={t.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      {(t.reconciliation_status === "MATCHED" || (t.match_confidence ?? 0) >= 0.85) &&
                        t.reconciliation_status !== "MANUALLY_MATCHED" && (
                          <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                        )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">{t.transaction_date}</td>
                    <td className="p-3 max-w-md">
                      <div className="truncate" title={t.description}>{t.cleaned_description || t.description}</div>
                      <div className="mt-1"><CategoryBadge category={t.category} /></div>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <TxnAmount amount={Number(t.amount)} type={t.transaction_type} />
                    </td>
                    <td className="p-3"><MatchStatusBadge status={t.reconciliation_status} confidence={t.match_confidence} /></td>
                    <td className="p-3 text-xs">
                      {inv ? (
                        <div>
                          <div className="font-medium">{inv.invoice_number}</div>
                          <div className="text-muted-foreground">{inv.buyer_name || inv.vendor_name}</div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-right"><ConfidencePill value={t.match_confidence} /></td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        {t.matched_invoice_id && t.reconciliation_status !== "MANUALLY_MATCHED" && (
                          <Button size="sm" variant="outline" onClick={async () => { await confirmFn({ data: { transactionId: t.id } }); toast.success("Confirmed"); onRefetch(); }}>Confirm</Button>
                        )}
                        {t.matched_invoice_id && (
                          <Button size="sm" variant="ghost" onClick={async () => { await rejectFn({ data: { transactionId: t.id } }); toast.success("Match removed"); onRefetch(); }}>Reject</Button>
                        )}
                        {!t.matched_invoice_id && t.reconciliation_status !== "EXCLUDED" && (
                          <Button size="sm" variant="outline" onClick={() => setMatchTxn(t)}>Match</Button>
                        )}
                        {t.reconciliation_status !== "EXCLUDED" && (
                          <Button size="sm" variant="ghost" onClick={async () => { await excludeFn({ data: { transactionId: t.id } }); toast.success("Excluded"); onRefetch(); }}>Exclude</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setNoteTxn(t)}>Note</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {matchTxn && (
        <ManualMatchSheet
          clientId={clientId}
          txn={matchTxn}
          onClose={() => setMatchTxn(null)}
          onMatched={() => { setMatchTxn(null); onRefetch(); }}
        />
      )}
      {noteTxn && (
        <NoteDialog
          txn={noteTxn}
          onClose={() => setNoteTxn(null)}
          onSaved={() => { setNoteTxn(null); onRefetch(); }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={`mt-2 font-display text-2xl font-semibold ${color || ""}`}>{value}</div>
    </div>
  );
}

function ManualMatchSheet({
  clientId, txn, onClose, onMatched,
}: { clientId: string; txn: any; onClose: () => void; onMatched: () => void }) {
  const search = useServerFn(searchInvoicesForMatch);
  const match = useServerFn(manualMatch);
  const [q, setQ] = useState("");
  const [useAmount, setUseAmount] = useState(true);

  const qR = useQuery({
    queryKey: ["match-search", txn.id, q, useAmount],
    queryFn: () =>
      search({
        data: {
          clientId,
          amount: useAmount ? Number(txn.amount) : undefined,
          tolerance: 10,
          q: q || undefined,
        },
      }),
  });

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Match Transaction</SheetTitle>
          <SheetDescription>Find an invoice that matches this bank transaction.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 p-4 rounded-xl bg-muted/40 text-sm space-y-1">
          <div><span className="text-muted-foreground">Date:</span> {txn.transaction_date}</div>
          <div><span className="text-muted-foreground">Description:</span> {txn.description}</div>
          <div><span className="text-muted-foreground">Amount:</span> <TxnAmount amount={Number(txn.amount)} type={txn.transaction_type} /></div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Invoice number, party name…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="text-xs flex items-center gap-1">
            <Checkbox checked={useAmount} onCheckedChange={(v) => setUseAmount(!!v)} />
            Filter by amount
          </label>
        </div>

        <div className="mt-4 space-y-2">
          {qR.isLoading && <div className="text-center p-6"><Loader2 className="size-5 animate-spin text-primary inline" /></div>}
          {qR.data?.invoices?.length === 0 && <div className="text-sm text-muted-foreground p-4 text-center">No matching invoices found.</div>}
          {qR.data?.invoices?.map((inv: any) => {
            const amountMatch = Math.abs(Number(inv.total_amount) - Number(txn.amount)) <= 10;
            const dateDiff = inv.invoice_date ? Math.abs(new Date(inv.invoice_date).getTime() - new Date(txn.transaction_date).getTime()) / (86400 * 1000) : 999;
            const dateClose = dateDiff <= 30;
            return (
              <div key={inv.id} className="border rounded-xl p-3 hover:bg-muted/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{inv.invoice_number}</div>
                    <div className="text-xs text-muted-foreground truncate">{inv.buyer_name || inv.vendor_name} • {inv.invoice_date}</div>
                  </div>
                  <div className="font-mono text-sm whitespace-nowrap">₹{Number(inv.total_amount).toLocaleString("en-IN")}</div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className={amountMatch ? "text-green-700" : "text-amber-700"}>
                    {amountMatch ? "✓ Amount matches" : "⚠ Amount differs"}
                  </span>
                  <span className={dateClose ? "text-green-700" : "text-amber-700"}>
                    {dateClose ? "✓ Date close" : "⚠ Date far"}
                  </span>
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={async () => {
                      await match({ data: { transactionId: txn.id, invoiceId: inv.id } });
                      toast.success("Matched");
                      onMatched();
                    }}
                  >
                    Confirm Match
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NoteDialog({ txn, onClose, onSaved }: { txn: any; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(addTxnNote);
  const [note, setNote] = useState<string>(txn.notes || "");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add note</DialogTitle></DialogHeader>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Internal note…" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => { await save({ data: { transactionId: txn.id, note } }); toast.success("Saved"); onSaved(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
