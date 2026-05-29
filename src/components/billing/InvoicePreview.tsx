import { forwardRef } from "react";
import { format } from "date-fns";
import { formatInr } from "./utils";

type PreviewProps = {
  firm: { name: string; logo_url?: string | null; primary_color?: string | null };
  settings: any;
  invoice: any;
  items: any[];
};

export const InvoicePreview = forwardRef<HTMLDivElement, PreviewProps>(function InvoicePreview(
  { firm, settings, invoice, items },
  ref,
) {
  const client = invoice.clients;
  const color = firm.primary_color || "#1f6f4a";

  return (
    <div
      ref={ref}
      className="bg-white text-gray-900 rounded-lg border border-gray-200 shadow-sm p-8 md:p-10 text-sm print:shadow-none print:border-0"
      id="invoice-print-root"
    >
      <div className="flex justify-between gap-6 border-b border-gray-200 pb-6">
        <div className="flex gap-4 items-start">
          {firm.logo_url ? (
            <img src={firm.logo_url} alt="" className="h-14 w-14 object-contain" />
          ) : (
            <div className="h-14 w-14 rounded-lg grid place-items-center text-white font-bold text-lg" style={{ background: color }}>
              {(firm.name || "CA")[0]}
            </div>
          )}
          <div>
            <div className="text-xl font-semibold text-gray-900">{firm.name}</div>
            {settings?.gstin && <div className="text-xs text-gray-500 mt-1">GSTIN: {settings.gstin}</div>}
            {settings?.pan && <div className="text-xs text-gray-500">PAN: {settings.pan}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight" style={{ color }}>TAX INVOICE</div>
          <div className="mt-2 text-gray-600">#{invoice.invoice_number}</div>
          <div className="text-xs text-gray-500 mt-1">
            Date: {format(new Date(invoice.invoice_date), "dd MMM yyyy")}
          </div>
          <div className="text-xs text-gray-500">
            Due: {format(new Date(invoice.due_date), "dd MMM yyyy")}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 py-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Bill to</div>
          <div className="font-semibold text-gray-900 mt-1">{client?.business_name}</div>
          {client?.gstin && <div className="text-xs text-gray-500">GSTIN: {client.gstin}</div>}
          {client?.contact_name && <div className="text-xs text-gray-500 mt-1">{client.contact_name}</div>}
        </div>
        {invoice.period_label && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Period</div>
            <div className="mt-1 text-gray-800">{invoice.period_label}</div>
          </div>
        )}
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-gray-200 bg-gray-50">
            <th className="text-left py-2 px-2 font-semibold">Description</th>
            <th className="text-right py-2 px-2 font-semibold w-16">Qty</th>
            <th className="text-right py-2 px-2 font-semibold w-24">Rate</th>
            <th className="text-right py-2 px-2 font-semibold w-16">GST%</th>
            <th className="text-right py-2 px-2 font-semibold w-28">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-2.5 px-2">{it.description}</td>
              <td className="py-2.5 px-2 text-right tabular-nums">{it.quantity}</td>
              <td className="py-2.5 px-2 text-right tabular-nums">{formatInr(Number(it.unit_price))}</td>
              <td className="py-2.5 px-2 text-right tabular-nums">{it.gst_rate}%</td>
              <td className="py-2.5 px-2 text-right tabular-nums font-medium">{formatInr(Number(it.total))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mt-6">
        <div className="w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="tabular-nums">{formatInr(Number(invoice.subtotal))}</span></div>
          {invoice.is_inter_state ? (
            <div className="flex justify-between"><span className="text-gray-500">IGST</span><span className="tabular-nums">{formatInr(Number(invoice.igst_amount))}</span></div>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-gray-500">CGST</span><span className="tabular-nums">{formatInr(Number(invoice.cgst_amount))}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">SGST</span><span className="tabular-nums">{formatInr(Number(invoice.sgst_amount))}</span></div>
            </>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-base">
            <span>Total</span>
            <span className="tabular-nums" style={{ color }}>{formatInr(Number(invoice.total_amount))}</span>
          </div>
          {Number(invoice.amount_paid) > 0 && (
            <>
              <div className="flex justify-between text-emerald-700"><span>Paid</span><span className="tabular-nums">{formatInr(Number(invoice.amount_paid))}</span></div>
              <div className="flex justify-between font-semibold"><span>Balance due</span><span className="tabular-nums">{formatInr(Number(invoice.balance_due))}</span></div>
            </>
          )}
        </div>
      </div>

      {(invoice.payment_terms || invoice.notes) && (
        <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-600 space-y-2">
          {invoice.payment_terms && <p><strong>Payment terms:</strong> {invoice.payment_terms}</p>}
          {invoice.notes && <p><strong>Notes:</strong> {invoice.notes}</p>}
        </div>
      )}

      <div className="mt-6 p-4 rounded-lg bg-gray-50 text-xs text-gray-700 space-y-1">
        <div className="font-semibold text-gray-900">Payment instructions</div>
        {settings?.upi_id && <p>UPI: {settings.upi_id}{invoice.upi_link ? ` · ${invoice.upi_link}` : ""}</p>}
        {settings?.bank_name && (
          <p>
            Bank: {settings.bank_name} · A/c {settings.bank_account} · IFSC {settings.bank_ifsc}
            {settings.account_holder ? ` · ${settings.account_holder}` : ""}
          </p>
        )}
      </div>

      {settings?.signature_url && (
        <div className="mt-8 flex justify-end">
          <img src={settings.signature_url} alt="Signature" className="h-16 object-contain" />
        </div>
      )}
    </div>
  );
});

export function printInvoicePdf() {
  window.print();
}
