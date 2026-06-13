import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";

export type QrViewerData = {
  irn: string | null;
  ackNumber: string | null;
  ackDate: string | null;
  qrImage: string | null; // data URL
  signedJson: string | null;
  invoiceNumber: string;
};

export function QrViewerDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: QrViewerData | null;
}) {
  if (!data) return null;
  const downloadPng = () => {
    if (!data.qrImage) return;
    const a = document.createElement("a");
    a.href = data.qrImage;
    a.download = `IRN-${data.invoiceNumber}.png`;
    a.click();
  };
  const downloadJson = () => {
    if (!data.signedJson) return;
    const blob = new Blob([data.signedJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IRN-${data.invoiceNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const printQr = () => {
    if (!data.qrImage) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const invNo = escHtml(data.invoiceNumber);
    const irn = escHtml(data.irn ?? "");
    const ack = escHtml(data.ackNumber ?? "");
    const ackDate = escHtml(data.ackDate ? new Date(data.ackDate).toLocaleString("en-IN") : "");
    const qr = escHtml(data.qrImage);
    w.document.write(
      `<html><head><title>IRN ${invNo}</title></head><body style="text-align:center;font-family:sans-serif;padding:32px">
       <img src="${qr}" style="width:280px;height:280px"/>
       <div style="font-size:11px;margin-top:12px;word-break:break-all">${irn}</div>
       <div style="font-size:11px;margin-top:4px">Ack: ${ack} · ${ackDate}</div>
       </body></html>`,
    );
    w.document.close();
    w.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>e-Invoice QR Code</DialogTitle>
          <DialogDescription>Invoice {data.invoiceNumber}</DialogDescription>
        </DialogHeader>
        <div className="bg-white rounded-2xl p-6 grid place-items-center border">
          {data.qrImage ? (
            <img src={data.qrImage} alt="IRN QR" className="size-64" />
          ) : (
            <p className="text-sm text-muted-foreground">QR not available.</p>
          )}
        </div>
        <div className="space-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">IRN: </span>
            <span className="font-mono break-all">{data.irn}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Ack No: </span>
            <span className="font-mono">{data.ackNumber}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Ack Date: </span>
            {data.ackDate ? new Date(data.ackDate).toLocaleString("en-IN") : "—"}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={downloadPng}>
            <Download className="size-4 mr-1.5" /> QR PNG
          </Button>
          <Button variant="outline" size="sm" onClick={downloadJson}>
            <Download className="size-4 mr-1.5" /> Signed JSON
          </Button>
          <Button variant="outline" size="sm" onClick={printQr}>
            <Printer className="size-4 mr-1.5" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelIrnDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: "1" | "2" | "3" | "4", text: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState<"1" | "2" | "3" | "4">("2");
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel IRN</DialogTitle>
          <DialogDescription>
            Only possible within 24 hours of generation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-muted-foreground">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="1">Duplicate</option>
              <option value="2">Data Entry Mistake</option>
              <option value="3">Order Cancelled</option>
              <option value="4">Others</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Notes</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="destructive" disabled={busy} onClick={() => onConfirm(reason, text)}>
            {busy ? "Cancelling…" : "Cancel IRN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
