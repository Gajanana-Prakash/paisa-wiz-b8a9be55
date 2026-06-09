import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Plus, AlertTriangle, X, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listClientEwayBills,
  generateEwayBill,
  cancelEwayBill,
  extendEwayBill,
  updateEwayVehicle,
} from "@/lib/eway.functions";
import {
  EwbSandboxBanner,
  EwbStatusBadge,
  TransportModeIcon,
  ValidityCountdown,
} from "@/components/eway/StatusBadges";

export const Route = createFileRoute("/_authenticated/ca/clients/$clientId/eway-bills")({
  component: ClientEwayBillsPage,
});

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" | "ok" }) {
  const toneCls =
    tone === "warn"
      ? "text-amber-700"
      : tone === "danger"
        ? "text-rose-700"
        : tone === "ok"
          ? "text-emerald-700"
          : "text-foreground";
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-3xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

type ItemRow = {
  productName: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  taxableValue: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
};

function emptyItem(): ItemRow {
  return { productName: "", hsnCode: "", quantity: 1, unit: "NOS", taxableValue: 0, cgstRate: 0, sgstRate: 0, igstRate: 18 };
}

function estimateValidityDays(distance: number, vehicleType: "REGULAR" | "OVER_DIMENSIONAL_CARGO") {
  const perDay = vehicleType === "OVER_DIMENSIONAL_CARGO" ? 20 : 200;
  return Math.max(1, Math.ceil((distance || 1) / perDay));
}

function ClientEwayBillsPage() {
  const { clientId } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(listClientEwayBills);
  const generate = useServerFn(generateEwayBill);
  const cancel = useServerFn(cancelEwayBill);
  const extend = useServerFn(extendEwayBill);
  const updateVehicle = useServerFn(updateEwayVehicle);

  const { data, isLoading } = useQuery({
    queryKey: ["ewb-list", clientId],
    queryFn: () => load({ data: { clientId } }),
  });

  const [showForm, setShowForm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [extendTarget, setExtendTarget] = useState<{ id: string } | null>(null);
  const [vehicleTarget, setVehicleTarget] = useState<{ id: string; current: string | null } | null>(null);

  if (isLoading)
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );

  const summary = data?.summary ?? { active: 0, expiringToday: 0, expiringWeek: 0, cancelled: 0, expired: 0 };
  const items = data?.items ?? [];
  const expiring = items.filter(
    (i) => (i.status === "ACTIVE" || i.status === "EXTENDED") && i.hoursRemaining != null && i.hoursRemaining <= 24,
  );

  const runCancel = async (id: string, reason: "1" | "2" | "3" | "4", text: string) => {
    try {
      await cancel({ data: { id, reasonCode: reason, reasonText: text } });
      toast.success("E-way bill cancelled");
      setCancelTarget(null);
      qc.invalidateQueries({ queryKey: ["ewb-list", clientId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel");
    }
  };

  const runExtend = async (id: string, vehicleNumber: string, fromPlace: string, remainingDistance: number) => {
    try {
      await extend({ data: { id, vehicleNumber, fromPlace, remainingDistance } });
      toast.success("Validity extended");
      setExtendTarget(null);
      qc.invalidateQueries({ queryKey: ["ewb-list", clientId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not extend");
    }
  };

  const runUpdateVehicle = async (id: string, vehicleNumber: string, fromPlace: string, reasonCode: "1" | "2" | "3") => {
    try {
      await updateVehicle({ data: { id, vehicleNumber, fromPlace, reasonCode } });
      toast.success("Vehicle updated");
      setVehicleTarget(null);
      qc.invalidateQueries({ queryKey: ["ewb-list", clientId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not update vehicle");
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/ca/clients/$clientId" params={{ clientId }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to client
        </Link>
        <Link to="/ca/settings/eway-bill" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
          EWB settings →
        </Link>
      </div>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">E-Way Bills</h1>
          <p className="text-muted-foreground text-sm mt-1">Generate and track e-way bills for goods movement above ₹50,000.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="size-4" /> Generate E-Way Bill
        </Button>
      </div>

      <EwbSandboxBanner mockMode={data?.mockMode ?? false} sandbox={data?.sandboxMode ?? true} />

      {expiring.length > 0 && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 text-rose-900 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="size-5 mt-0.5" />
          <div className="flex-1 text-sm">
            <strong>🚨 {expiring.length} e-way bills expire today</strong> — extend validity or confirm delivery.
            <ul className="mt-2 space-y-0.5 text-xs">
              {expiring.slice(0, 5).map((i) => (
                <li key={i.id}>
                  EWB {i.ewbNumber} · vehicle {i.vehicleNumber ?? "—"} · {i.fromPlace ?? "—"} → {i.toPlace ?? "—"}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active EWBs" value={summary.active} tone="ok" />
        <StatCard label="Expiring Today" value={summary.expiringToday} tone="danger" />
        <StatCard label="Expiring This Week" value={summary.expiringWeek} tone="warn" />
        <StatCard label="Cancelled" value={summary.cancelled} />
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">EWB No</th>
              <th className="px-3 py-2">Doc No</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">Vehicle</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Valid Until</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground text-sm">
                  No e-way bills yet. Click "Generate E-Way Bill" to create one.
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{r.ewbNumber}</td>
                <td className="px-3 py-2">{r.documentNumber}</td>
                <td className="px-3 py-2">{r.ewbDate ? new Date(r.ewbDate).toLocaleDateString("en-IN") : "—"}</td>
                <td className="px-3 py-2">
                  {r.fromPlace ?? "—"} <span className="text-muted-foreground">→</span> {r.toPlace ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.vehicleNumber ?? "—"}</td>
                <td className="px-3 py-2"><TransportModeIcon mode={r.transportMode} /></td>
                <td className="px-3 py-2">{fmt(r.totalValue)}</td>
                <td className="px-3 py-2"><ValidityCountdown validUntil={r.ewbValidUntil} hours={r.hoursRemaining} /></td>
                <td className="px-3 py-2"><EwbStatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {(r.status === "ACTIVE" || r.status === "EXTENDED") && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setVehicleTarget({ id: r.id, current: r.vehicleNumber })}>
                          Vehicle
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setExtendTarget({ id: r.id })}>
                          Extend
                        </Button>
                        <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => setCancelTarget(r.id)}>
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GenerateEwbDialog
        open={showForm}
        onOpenChange={setShowForm}
        clientId={clientId}
        defaultMode={data?.defaults.transportMode ?? "ROAD"}
        defaultVehicle={data?.defaults.vehicleType ?? "REGULAR"}
        onSubmit={async (payload) => {
          const res = await generate({ data: { clientId, ...payload } });
          if (!res.ok) {
            toast.error(`${res.errorCode}: ${res.errorMessage}`);
            return false;
          }
          toast.success(`E-way bill ${res.ewbNumber} generated`);
          qc.invalidateQueries({ queryKey: ["ewb-list", clientId] });
          return true;
        }}
      />

      <CancelDialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)} onConfirm={(reason, text) => cancelTarget && runCancel(cancelTarget, reason, text)} />
      <ExtendDialog open={!!extendTarget} onOpenChange={(v) => !v && setExtendTarget(null)} onConfirm={(v, p, d) => extendTarget && runExtend(extendTarget.id, v, p, d)} />
      <UpdateVehicleDialog
        open={!!vehicleTarget}
        onOpenChange={(v) => !v && setVehicleTarget(null)}
        currentVehicle={vehicleTarget?.current ?? null}
        onConfirm={(v, p, r) => vehicleTarget && runUpdateVehicle(vehicleTarget.id, v, p, r)}
      />
    </div>
  );
}

// ============ Generate dialog (full-form) ============

function GenerateEwbDialog({
  open,
  onOpenChange,
  clientId,
  defaultMode,
  defaultVehicle,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  defaultMode: "ROAD" | "RAIL" | "AIR" | "SHIP";
  defaultVehicle: "REGULAR" | "OVER_DIMENSIONAL_CARGO";
  onSubmit: (payload: any) => Promise<boolean>;
}) {
  const [supplyType, setSupplyType] = useState<"OUTWARD" | "INWARD">("OUTWARD");
  const [docType, setDocType] = useState<"TAX_INVOICE" | "BILL_OF_SUPPLY" | "CHALLAN" | "CREDIT_NOTE" | "BILL_OF_ENTRY" | "OTHERS">("TAX_INVOICE");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromGstin, setFromGstin] = useState("");
  const [fromPlace, setFromPlace] = useState("");
  const [fromPincode, setFromPincode] = useState("");
  const [fromStateCode, setFromStateCode] = useState("");
  const [toGstin, setToGstin] = useState("");
  const [toTradeName, setToTradeName] = useState("");
  const [toPlace, setToPlace] = useState("");
  const [toPincode, setToPincode] = useState("");
  const [toStateCode, setToStateCode] = useState("");
  const [transportMode, setTransportMode] = useState<"ROAD" | "RAIL" | "AIR" | "SHIP">(defaultMode);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<"REGULAR" | "OVER_DIMENSIONAL_CARGO">(defaultVehicle);
  const [transporterName, setTransporterName] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [hsnCode, setHsnCode] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);

  const totals = useMemo(() => {
    let taxable = 0,
      cgst = 0,
      sgst = 0,
      igst = 0;
    items.forEach((it) => {
      const t = Number(it.taxableValue || 0);
      taxable += t;
      cgst += (t * Number(it.cgstRate || 0)) / 100;
      sgst += (t * Number(it.sgstRate || 0)) / 100;
      igst += (t * Number(it.igstRate || 0)) / 100;
    });
    const totalValue = taxable + cgst + sgst + igst;
    return { taxable, cgst, sgst, igst, totalValue };
  }, [items]);

  const validityDays = estimateValidityDays(distanceKm, vehicleType);

  const updateItem = (i: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const removeItem = (i: number) => setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const submit = async () => {
    if (!docNumber.trim()) {
      toast.error("Document number is required");
      return;
    }
    if (!distanceKm || distanceKm <= 0) {
      toast.error("Distance must be greater than zero");
      return;
    }
    if (items.some((it) => !it.productName.trim() || it.taxableValue <= 0)) {
      toast.error("Each item needs a name and a taxable value");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onSubmit({
        supplyType,
        transactionType: "REGULAR",
        documentType: docType,
        documentNumber: docNumber.trim(),
        documentDate: docDate,
        fromGstin: fromGstin.trim() || null,
        fromPlace: fromPlace.trim() || null,
        fromPincode: fromPincode.trim() || null,
        fromStateCode: fromStateCode.trim() || null,
        toGstin: toGstin.trim() || null,
        toTradeName: toTradeName.trim() || null,
        toPlace: toPlace.trim() || null,
        toPincode: toPincode.trim() || null,
        toStateCode: toStateCode.trim() || null,
        totalValue: Number(totals.totalValue.toFixed(2)),
        hsnCode: hsnCode.trim() || items[0]?.hsnCode || null,
        transportMode,
        vehicleNumber: vehicleNumber.trim().toUpperCase() || null,
        vehicleType,
        transporterName: transporterName.trim() || null,
        transporterId: transporterId.trim().toUpperCase() || null,
        distanceKm: Math.round(distanceKm),
        items: items.map((it) => ({
          productName: it.productName.trim(),
          hsnCode: it.hsnCode.trim() || null,
          quantity: Number(it.quantity || 0),
          unit: it.unit.trim() || null,
          taxableValue: Number(it.taxableValue || 0),
          cgstRate: Number(it.cgstRate || 0),
          sgstRate: Number(it.sgstRate || 0),
          igstRate: Number(it.igstRate || 0),
        })),
      });
      if (ok) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate E-Way Bill</DialogTitle>
        </DialogHeader>

        <div className="grid lg:grid-cols-[1fr_280px] gap-6">
          <div className="space-y-6">
            {/* Section 1 — Transaction */}
            <section>
              <h3 className="font-display font-semibold text-sm uppercase tracking-wide text-muted-foreground">1 · Transaction</h3>
              <div className="grid md:grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-xs">Supply Type</Label>
                  <select className="mt-1 w-full h-9 rounded-md border bg-transparent px-2 text-sm" value={supplyType} onChange={(e) => setSupplyType(e.target.value as any)}>
                    <option value="OUTWARD">Outward</option>
                    <option value="INWARD">Inward</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Document Type</Label>
                  <select className="mt-1 w-full h-9 rounded-md border bg-transparent px-2 text-sm" value={docType} onChange={(e) => setDocType(e.target.value as any)}>
                    <option value="TAX_INVOICE">Tax Invoice</option>
                    <option value="BILL_OF_SUPPLY">Bill of Supply</option>
                    <option value="CHALLAN">Challan</option>
                    <option value="CREDIT_NOTE">Credit Note</option>
                    <option value="BILL_OF_ENTRY">Bill of Entry</option>
                    <option value="OTHERS">Others</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Document Number</Label>
                  <Input className="mt-1" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} maxLength={40} />
                </div>
                <div>
                  <Label className="text-xs">Document Date</Label>
                  <Input type="date" className="mt-1" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
                </div>
              </div>
            </section>

            {/* Section 2 — From */}
            <section>
              <h3 className="font-display font-semibold text-sm uppercase tracking-wide text-muted-foreground">2 · From (Consignor)</h3>
              <div className="grid md:grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-xs">GSTIN</Label>
                  <Input className="mt-1 font-mono" value={fromGstin} onChange={(e) => setFromGstin(e.target.value.toUpperCase())} maxLength={15} />
                </div>
                <div>
                  <Label className="text-xs">Place</Label>
                  <Input className="mt-1" value={fromPlace} onChange={(e) => setFromPlace(e.target.value)} maxLength={120} />
                </div>
                <div>
                  <Label className="text-xs">Pincode</Label>
                  <Input className="mt-1" value={fromPincode} onChange={(e) => setFromPincode(e.target.value.replace(/\D/g, ""))} maxLength={6} />
                </div>
                <div>
                  <Label className="text-xs">State Code</Label>
                  <Input className="mt-1" value={fromStateCode} onChange={(e) => setFromStateCode(e.target.value.replace(/\D/g, ""))} maxLength={2} />
                </div>
              </div>
            </section>

            {/* Section 3 — To */}
            <section>
              <h3 className="font-display font-semibold text-sm uppercase tracking-wide text-muted-foreground">3 · To (Consignee)</h3>
              <div className="grid md:grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-xs">GSTIN</Label>
                  <Input className="mt-1 font-mono" value={toGstin} onChange={(e) => setToGstin(e.target.value.toUpperCase())} maxLength={15} />
                </div>
                <div>
                  <Label className="text-xs">Trade Name</Label>
                  <Input className="mt-1" value={toTradeName} onChange={(e) => setToTradeName(e.target.value)} maxLength={200} />
                </div>
                <div>
                  <Label className="text-xs">Place</Label>
                  <Input className="mt-1" value={toPlace} onChange={(e) => setToPlace(e.target.value)} maxLength={120} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Pincode</Label>
                    <Input className="mt-1" value={toPincode} onChange={(e) => setToPincode(e.target.value.replace(/\D/g, ""))} maxLength={6} />
                  </div>
                  <div>
                    <Label className="text-xs">State Code</Label>
                    <Input className="mt-1" value={toStateCode} onChange={(e) => setToStateCode(e.target.value.replace(/\D/g, ""))} maxLength={2} />
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4 — Items */}
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-sm uppercase tracking-wide text-muted-foreground">4 · Items</h3>
                <Button size="sm" variant="outline" onClick={addItem}>
                  <Plus className="size-3 mr-1" /> Add Item
                </Button>
              </div>
              <div className="mt-2 overflow-x-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-2 py-1.5">Product</th>
                      <th className="px-2 py-1.5">HSN</th>
                      <th className="px-2 py-1.5">Qty</th>
                      <th className="px-2 py-1.5">Unit</th>
                      <th className="px-2 py-1.5">Taxable</th>
                      <th className="px-2 py-1.5">CGST%</th>
                      <th className="px-2 py-1.5">SGST%</th>
                      <th className="px-2 py-1.5">IGST%</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1"><Input className="h-8 text-xs" value={it.productName} onChange={(e) => updateItem(i, { productName: e.target.value })} /></td>
                        <td className="px-2 py-1 w-20"><Input className="h-8 text-xs font-mono" value={it.hsnCode} onChange={(e) => updateItem(i, { hsnCode: e.target.value })} maxLength={8} /></td>
                        <td className="px-2 py-1 w-16"><Input type="number" className="h-8 text-xs" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1 w-16"><Input className="h-8 text-xs" value={it.unit} onChange={(e) => updateItem(i, { unit: e.target.value })} maxLength={6} /></td>
                        <td className="px-2 py-1 w-24"><Input type="number" className="h-8 text-xs" value={it.taxableValue} onChange={(e) => updateItem(i, { taxableValue: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1 w-14"><Input type="number" className="h-8 text-xs" value={it.cgstRate} onChange={(e) => updateItem(i, { cgstRate: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1 w-14"><Input type="number" className="h-8 text-xs" value={it.sgstRate} onChange={(e) => updateItem(i, { sgstRate: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1 w-14"><Input type="number" className="h-8 text-xs" value={it.igstRate} onChange={(e) => updateItem(i, { igstRate: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1 w-8">
                          <Button size="icon" variant="ghost" disabled={items.length === 1} onClick={() => removeItem(i)} className="size-7">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 5 — Transport */}
            <section>
              <h3 className="font-display font-semibold text-sm uppercase tracking-wide text-muted-foreground">5 · Transport</h3>
              <div className="grid md:grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-xs">Mode</Label>
                  <select className="mt-1 w-full h-9 rounded-md border bg-transparent px-2 text-sm" value={transportMode} onChange={(e) => setTransportMode(e.target.value as any)}>
                    <option value="ROAD">Road</option>
                    <option value="RAIL">Rail</option>
                    <option value="AIR">Air</option>
                    <option value="SHIP">Ship</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Distance (km)</Label>
                  <Input type="number" className="mt-1" value={distanceKm || ""} onChange={(e) => setDistanceKm(Number(e.target.value))} min={1} />
                </div>
                <div>
                  <Label className="text-xs">Vehicle Number</Label>
                  <Input className="mt-1 font-mono uppercase" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.replace(/\s+/g, "").toUpperCase())} maxLength={15} placeholder="MH12AB1234" />
                </div>
                <div>
                  <Label className="text-xs">Vehicle Type</Label>
                  <select className="mt-1 w-full h-9 rounded-md border bg-transparent px-2 text-sm" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as any)}>
                    <option value="REGULAR">Regular</option>
                    <option value="OVER_DIMENSIONAL_CARGO">Over-Dimensional Cargo</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Transporter Name</Label>
                  <Input className="mt-1" value={transporterName} onChange={(e) => setTransporterName(e.target.value)} maxLength={200} />
                </div>
                <div>
                  <Label className="text-xs">Transporter GSTIN (optional)</Label>
                  <Input className="mt-1 font-mono" value={transporterId} onChange={(e) => setTransporterId(e.target.value.toUpperCase())} maxLength={15} />
                </div>
              </div>
            </section>
          </div>

          {/* Sticky preview */}
          <aside className="lg:sticky lg:top-2 self-start rounded-2xl border bg-muted/30 p-4 space-y-3 h-fit">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Preview</div>
            <div>
              <div className="text-xs text-muted-foreground">Route</div>
              <div className="font-display text-base font-semibold leading-tight flex items-center gap-1.5">
                <span>{fromPlace || "From"}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
                <span>{toPlace || "To"}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Estimated validity</div>
              <div className="text-sm font-semibold">{validityDays} day{validityDays > 1 ? "s" : ""}</div>
              <div className="text-[10px] text-muted-foreground">Based on {distanceKm || 0}km · {vehicleType === "OVER_DIMENSIONAL_CARGO" ? "ODC (20km/day)" : "Regular (200km/day)"}</div>
            </div>
            <div className="space-y-1 text-sm border-t pt-3">
              <div className="flex justify-between"><span className="text-muted-foreground">Taxable</span><span>{fmt(totals.taxable)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{fmt(totals.cgst)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{fmt(totals.sgst)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{fmt(totals.igst)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Total</span><span>{fmt(totals.totalValue)}</span></div>
            </div>
          </aside>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-1.5" />} Generate E-Way Bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Small dialogs ============

function CancelDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: (reason: "1" | "2" | "3" | "4", text: string) => void }) {
  const [reason, setReason] = useState<"1" | "2" | "3" | "4">("1");
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel E-Way Bill</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">EWBs can only be cancelled within 24 hours of generation and before goods are in transit.</p>
        <div>
          <Label className="text-xs">Reason</Label>
          <select className="mt-1 w-full h-9 rounded-md border bg-transparent px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value as any)}>
            <option value="1">Duplicate</option>
            <option value="2">Order Cancelled</option>
            <option value="3">Data Entry Mistake</option>
            <option value="4">Others</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Remarks</Label>
          <Input className="mt-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button variant="destructive" onClick={() => onConfirm(reason, text)}>Confirm Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtendDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: (vehicle: string, fromPlace: string, distance: number) => void }) {
  const [vehicle, setVehicle] = useState("");
  const [place, setPlace] = useState("");
  const [distance, setDistance] = useState<number>(0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend Validity</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Extend the validity when goods are in transit and won't reach the destination before expiry.</p>
        <div>
          <Label className="text-xs">Current Vehicle Number</Label>
          <Input className="mt-1 font-mono uppercase" value={vehicle} onChange={(e) => setVehicle(e.target.value.replace(/\s+/g, "").toUpperCase())} maxLength={15} />
        </div>
        <div>
          <Label className="text-xs">Current Place</Label>
          <Input className="mt-1" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} />
        </div>
        <div>
          <Label className="text-xs">Remaining Distance (km)</Label>
          <Input type="number" className="mt-1" value={distance || ""} onChange={(e) => setDistance(Number(e.target.value))} min={1} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onConfirm(vehicle, place, distance)} disabled={!vehicle || !place || !distance}>Extend</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpdateVehicleDialog({ open, onOpenChange, currentVehicle, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; currentVehicle: string | null; onConfirm: (vehicle: string, place: string, reason: "1" | "2" | "3") => void }) {
  const [vehicle, setVehicle] = useState("");
  const [place, setPlace] = useState("");
  const [reason, setReason] = useState<"1" | "2" | "3">("1");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Vehicle Number (Part B)</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Use this when the vehicle changes mid-transit.</p>
        <div>
          <Label className="text-xs">Current Vehicle</Label>
          <div className="mt-1 font-mono text-sm bg-muted/30 rounded-md px-2 py-1.5 border">{currentVehicle ?? "—"}</div>
        </div>
        <div>
          <Label className="text-xs">New Vehicle Number</Label>
          <Input className="mt-1 font-mono uppercase" value={vehicle} onChange={(e) => setVehicle(e.target.value.replace(/\s+/g, "").toUpperCase())} maxLength={15} placeholder="MH12AB1234" />
        </div>
        <div>
          <Label className="text-xs">Place of Change</Label>
          <Input className="mt-1" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} />
        </div>
        <div>
          <Label className="text-xs">Reason</Label>
          <select className="mt-1 w-full h-9 rounded-md border bg-transparent px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value as any)}>
            <option value="1">Breakdown</option>
            <option value="2">Transhipment</option>
            <option value="3">Others</option>
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onConfirm(vehicle, place, reason)} disabled={!vehicle || !place}>Update Vehicle</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
