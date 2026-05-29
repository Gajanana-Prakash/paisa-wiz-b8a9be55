import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveDscRecord } from "@/lib/dsc.functions";
import { listFirmClientsLite } from "@/lib/tasks.functions";
import { useQuery } from "@tanstack/react-query";
import { addYears, ISSUING_AUTHORITIES, USED_FOR_OPTIONS } from "@/lib/dsc.server";

export function AddDscDialog({
  open,
  onOpenChange,
  clientId: presetClientId,
  editRecord,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId?: string;
  editRecord?: any;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveDscRecord);
  const listClients = useServerFn(listFirmClientsLite);

  const [isFirmOwned, setIsFirmOwned] = useState(false);
  const [clientId, setClientId] = useState(presetClientId ?? "");
  const [holderName, setHolderName] = useState("");
  const [designation, setDesignation] = useState("");
  const [pan, setPan] = useState("");
  const [din, setDin] = useState("");
  const [dscClass, setDscClass] = useState<"CLASS_2" | "CLASS_3">("CLASS_3");
  const [dscType, setDscType] = useState<"INDIVIDUAL" | "ORGANIZATION">("INDIVIDUAL");
  const [authority, setAuthority] = useState("eMudhra");
  const [serial, setSerial] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState(() => addYears(new Date().toISOString().slice(0, 10), 2));
  const [validityYears, setValidityYears] = useState<1 | 2>(2);
  const [tokenType, setTokenType] = useState("");
  const [tokenLocation, setTokenLocation] = useState("");
  const [usbId, setUsbId] = useState("");
  const [usedFor, setUsedFor] = useState<string[]>(["GST_FILING"]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["dsc-clients"],
    queryFn: () => listClients({ data: undefined as any }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (editRecord) {
      setIsFirmOwned(!editRecord.client_id);
      setClientId(editRecord.client_id ?? "");
      setHolderName(editRecord.holder_name ?? "");
      setDesignation(editRecord.holder_designation ?? "");
      setPan(editRecord.holder_pan ?? "");
      setDin(editRecord.holder_din ?? "");
      setDscClass(editRecord.dsc_class);
      setDscType(editRecord.dsc_type);
      setAuthority(editRecord.issuing_authority ?? "eMudhra");
      setSerial(editRecord.serial_number ?? "");
      setIssueDate(editRecord.issue_date);
      setExpiryDate(editRecord.expiry_date);
      setTokenType(editRecord.token_type ?? "");
      setTokenLocation(editRecord.token_physical_location ?? "");
      setUsbId(editRecord.usb_token_id ?? "");
      setUsedFor(editRecord.used_for ?? []);
      setNotes(editRecord.notes ?? "");
    } else {
      setIsFirmOwned(false);
      setClientId(presetClientId ?? "");
      setHolderName("");
      setDesignation("");
      setPan("");
      setDin("");
      setIssueDate(new Date().toISOString().slice(0, 10));
      setExpiryDate(addYears(new Date().toISOString().slice(0, 10), 2));
      setTokenLocation("");
      setUsedFor(["GST_FILING"]);
      setNotes("");
    }
  }, [open, editRecord, presetClientId]);

  useEffect(() => {
    if (editRecord) return;
    setExpiryDate(addYears(issueDate, validityYears));
  }, [issueDate, validityYears, editRecord]);

  const toggleUsed = (id: string) => {
    setUsedFor((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!holderName.trim()) {
      toast.error("Holder name is required");
      return;
    }
    setBusy(true);
    try {
      await save({
        data: {
          id: editRecord?.id,
          isFirmOwned,
          clientId: clientId || null,
          holderName: holderName.trim(),
          holderDesignation: designation.trim() || null,
          holderPan: pan.trim() || null,
          holderDin: din.trim() || null,
          dscClass,
          dscType,
          issuingAuthority: authority,
          serialNumber: serial.trim() || null,
          issueDate,
          expiryDate,
          tokenType: tokenType.trim() || null,
          tokenPhysicalLocation: tokenLocation.trim() || null,
          usbTokenId: usbId.trim() || null,
          usedFor,
          notes: notes.trim() || null,
        },
      });
      qc.invalidateQueries({ queryKey: ["dsc-records"] });
      qc.invalidateQueries({ queryKey: ["dsc-dashboard"] });
      qc.invalidateQueries({ queryKey: ["dsc-record"] });
      toast.success(editRecord ? "DSC updated" : "DSC added");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editRecord ? "Edit DSC" : "Add DSC"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!presetClientId && (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label className="text-sm">CA firm&apos;s own DSC</Label>
              <Switch checked={isFirmOwned} onCheckedChange={setIsFirmOwned} />
            </div>
          )}
          {!isFirmOwned && !presetClientId && (
            <div>
              <Label className="text-xs">Client *</Label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input px-3 text-sm">
                <option value="">Select client…</option>
                {(clients as any[]).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">DSC holder name *</Label>
              <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Designation</Label>
              <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Managing Director" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">PAN</Label>
              <Input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} className="mt-1 font-mono" />
            </div>
            <div>
              <Label className="text-xs">DIN (optional)</Label>
              <Input value={din} onChange={(e) => setDin(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Class</Label>
              <select value={dscClass} onChange={(e) => setDscClass(e.target.value as any)} className="mt-1 w-full h-9 rounded-md border border-input px-3 text-sm">
                <option value="CLASS_2">Class 2</option>
                <option value="CLASS_3">Class 3</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <select value={dscType} onChange={(e) => setDscType(e.target.value as any)} className="mt-1 w-full h-9 rounded-md border border-input px-3 text-sm">
                <option value="INDIVIDUAL">Individual</option>
                <option value="ORGANIZATION">Organization</option>
              </select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Issuing authority</Label>
              <select value={authority} onChange={(e) => setAuthority(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input px-3 text-sm">
                {ISSUING_AUTHORITIES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Serial number</Label>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="mt-1 font-mono text-sm" />
            </div>
            <div>
              <Label className="text-xs">Issue date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Validity</Label>
              <select value={validityYears} onChange={(e) => setValidityYears(Number(e.target.value) as 1 | 2)} className="mt-1 w-full h-9 rounded-md border border-input px-3 text-sm" disabled={!!editRecord}>
                <option value={1}>1 year</option>
                <option value={2}>2 years</option>
              </select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-semibold text-primary">Expiry date</Label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="mt-1 font-semibold" />
            </div>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <Label className="text-xs font-semibold">USB token location</Label>
            <Input value={tokenType} onChange={(e) => setTokenType(e.target.value)} placeholder="e.g. Watchdata USB Token" className="h-8 text-sm" />
            <Input value={tokenLocation} onChange={(e) => setTokenLocation(e.target.value)} placeholder="Physical location — CA safe, client office…" className="h-8 text-sm" />
            <Input value={usbId} onChange={(e) => setUsbId(e.target.value)} placeholder="Token label / serial on USB" className="h-8 text-sm font-mono" />
          </div>
          <div>
            <Label className="text-xs">Used for</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {USED_FOR_OPTIONS.map((o) => (
                <label key={o.id} className="flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 cursor-pointer hover:bg-muted/50">
                  <input type="checkbox" checked={usedFor.includes(o.id)} onChange={() => toggleUsed(o.id)} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" />
          </div>
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Save DSC"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
