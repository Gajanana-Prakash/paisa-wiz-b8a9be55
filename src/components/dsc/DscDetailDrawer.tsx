import { useState } from "react";
import { format } from "date-fns";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, RefreshCw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { getDscRecord, markDscRenewed, getRenewalAlertPayload } from "@/lib/dsc.functions";
import { daysRemainingStyle, USED_FOR_OPTIONS } from "@/lib/dsc.server";
import { AddDscDialog } from "./AddDscDialog";
import { whatsappLink, mailtoLink } from "@/components/billing/utils";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    EXPIRING_SOON: "bg-orange-500/15 text-orange-700 border-orange-500/30",
    EXPIRED: "bg-muted text-muted-foreground",
    REVOKED: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status.replace("_", " ")}</Badge>;
}

export function DscDetailDrawer({
  dscId,
  open,
  onOpenChange,
}: {
  dscId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getDscRecord);
  const renew = useServerFn(markDscRenewed);
  const alertPayload = useServerFn(getRenewalAlertPayload);

  const [editOpen, setEditOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [newExpiry, setNewExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["dsc-record", dscId],
    queryFn: () => load({ data: { id: dscId! } }),
    enabled: !!dscId && open,
  });

  const r = data?.record;
  const daysStyle = r ? daysRemainingStyle(r.days_remaining, r.computed_status === "EXPIRED") : null;

  const handleRenew = async () => {
    if (!dscId || !newExpiry) return;
    setBusy(true);
    try {
      await renew({ data: { id: dscId, newExpiryDate: newExpiry } });
      qc.invalidateQueries({ queryKey: ["dsc-record", dscId] });
      qc.invalidateQueries({ queryKey: ["dsc-records"] });
      qc.invalidateQueries({ queryKey: ["dsc-dashboard"] });
      setRenewOpen(false);
      toast.success("Marked as renewed");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sendAlert = async () => {
    if (!dscId) return;
    try {
      const p = await alertPayload({ data: { id: dscId } });
      if (p.phone) window.open(whatsappLink(p.phone, p.message), "_blank");
      else if (p.email) {
        const m = mailtoLink(p.email, `DSC renewal reminder — ${p.holderName}`, p.message);
        if (m) window.location.href = m;
      } else {
        await navigator.clipboard.writeText(p.message);
        toast.success("Message copied — no client contact on file");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {isLoading && (
            <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin" /></div>
          )}
          {r && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display">{r.holder_name}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {r.clients?.business_name ?? "CA Firm DSC"} · {r.holder_designation ?? "—"}
                </p>
              </SheetHeader>

              <div className="mt-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-center">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Expiry date</div>
                <div className="text-2xl font-bold font-display mt-1">
                  {format(new Date(r.expiry_date), "dd MMM yyyy")}
                </div>
                {daysStyle && (
                  <span className={`inline-block mt-2 text-sm tabular-nums ${daysStyle.className} ${daysStyle.pulse ? "animate-pulse" : ""}`}>
                    {daysStyle.label} remaining
                  </span>
                )}
                <div className="mt-2">{statusBadge(r.computed_status)}</div>
              </div>

              {r.token_physical_location && (
                <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="text-[10px] uppercase tracking-widest font-semibold text-amber-800">USB token location</div>
                  <div className="text-sm font-medium mt-1">{r.token_physical_location}</div>
                  {r.token_type && <div className="text-xs text-muted-foreground mt-0.5">{r.token_type}</div>}
                  {r.usb_token_id && <div className="text-xs font-mono mt-1">ID: {r.usb_token_id}</div>}
                </div>
              )}

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Class</dt><dd className="font-medium">{r.dsc_class.replace("_", " ")}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Type</dt><dd className="font-medium">{r.dsc_type}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Authority</dt><dd>{r.issuing_authority ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Serial</dt><dd className="font-mono text-xs">{r.serial_number ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Issue date</dt><dd>{format(new Date(r.issue_date), "dd MMM yyyy")}</dd></div>
                <div><dt className="text-xs text-muted-foreground">PAN</dt><dd className="font-mono">{r.holder_pan ?? "—"}</dd></div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Used for</dt>
                  <dd className="flex flex-wrap gap-1 mt-1">
                    {(r.used_for ?? []).map((u: string) => (
                      <Badge key={u} variant="secondary" className="text-[10px]">
                        {USED_FOR_OPTIONS.find((o) => o.id === u)?.label ?? u}
                      </Badge>
                    ))}
                  </dd>
                </div>
                {r.notes && (
                  <div className="col-span-2"><dt className="text-xs text-muted-foreground">Notes</dt><dd className="mt-0.5">{r.notes}</dd></div>
                )}
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditOpen(true)}><Pencil className="size-3.5" /> Edit</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { setNewExpiry(""); setRenewOpen(true); }}><RefreshCw className="size-3.5" /> Mark renewed</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={sendAlert}><MessageCircle className="size-3.5" /> Alert client</Button>
              </div>

              {renewOpen && (
                <div className="mt-4 p-3 rounded-lg border border-border space-y-2">
                  <Label className="text-xs">New expiry date</Label>
                  <Input type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} />
                  <Button size="sm" onClick={handleRenew} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Confirm renewal"}</Button>
                </div>
              )}

              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Renewal history</h3>
                {(data?.history ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No renewals logged yet.</p>
                )}
                <ul className="space-y-2 text-sm">
                  {(data?.history ?? []).map((h: any) => (
                    <li key={h.id} className="border-l-2 border-primary/30 pl-3">
                      <div className="text-xs text-muted-foreground">{format(new Date(h.renewed_at), "dd MMM yyyy")} · {h.renewed_by_name}</div>
                      <div>{format(new Date(h.previous_expiry), "dd MMM yyyy")} → {format(new Date(h.new_expiry), "dd MMM yyyy")}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 text-xs text-muted-foreground border-t pt-3">
                <div>Added {format(new Date(r.created_at), "dd MMM yyyy HH:mm")}</div>
                <div>Last updated {format(new Date(r.updated_at), "dd MMM yyyy HH:mm")}</div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      {r && <AddDscDialog open={editOpen} onOpenChange={setEditOpen} editRecord={r} clientId={r.client_id ?? undefined} />}
    </>
  );
}
