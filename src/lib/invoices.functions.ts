import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const extractInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    invoiceId: z.string().uuid(),
    fileBase64: z.string().min(10),
    mimeType: z.string().min(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    await supabase.from("invoices").update({ status: "processing" }).eq("id", data.invoiceId);

    const schema = {
      type: "object",
      properties: {
        document_category: {
          type: "string",
          enum: ["sales_invoice","purchase_bill","expense_receipt","bank_statement","asset_purchase","other"],
          description: "Classify the document: sales_invoice (outgoing tax invoice issued by the business), purchase_bill (vendor bill received), expense_receipt (small POS/expense receipt), bank_statement (bank or credit-card statement), asset_purchase (fixed asset / capex purchase), or other.",
        },
        category_confidence: { type: "number", description: "0..1 confidence in document_category" },
        vendor_name: { type: "string" },
        vendor_gstin: { type: "string" },
        buyer_name: { type: "string" },
        buyer_gstin: { type: "string" },
        invoice_number: { type: "string" },
        invoice_date: { type: "string", description: "YYYY-MM-DD" },
        due_date: { type: "string", description: "YYYY-MM-DD or empty" },
        place_of_supply: { type: "string" },
        taxable_value: { type: "number" },
        cgst: { type: "number" },
        sgst: { type: "number" },
        igst: { type: "number" },
        cess: { type: "number" },
        total_amount: { type: "number" },
        currency: { type: "string" },
        confidence: { type: "number", description: "0..1 overall extraction confidence" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              hsn: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              taxable_value: { type: "number" },
              gst_rate: { type: "number" },
              gst_amount: { type: "number" },
            },
            required: ["description"],
            additionalProperties: false,
          },
        },
      },
      required: ["document_category", "vendor_name", "total_amount", "items", "confidence"],
      additionalProperties: false,
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You extract structured data from Indian accounting documents (GST invoices, vendor bills, expense receipts, bank statements, asset purchase invoices). First classify the document into one of: sales_invoice, purchase_bill, expense_receipt, bank_statement, asset_purchase, other. Then extract fields. Heuristics: if document title says 'Tax Invoice' and the business is the issuer → sales_invoice; if it's a vendor's bill addressed to the business → purchase_bill; small POS/cash receipt with no GSTIN or small amount → expense_receipt; multi-line transaction list with running balance from a bank → bank_statement; invoice for machinery/equipment/furniture/vehicles/capex items → asset_purchase. Return amounts as numbers without currency symbols. Use YYYY-MM-DD for dates. If a field is unknown, return empty string or 0. Always call the function." },
          { role: "user", content: [
            { type: "text", text: "Extract all invoice fields and line items from this document." },
            { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${data.fileBase64}` } },
          ]},
        ],
        tools: [{ type: "function", function: { name: "save_invoice", description: "Save extracted invoice data", parameters: schema } }],
        tool_choice: { type: "function", function: { name: "save_invoice" } },
      }),
    });
    if (!res.ok) {
      await supabase.from("invoices").update({ status: "error", notes: `AI error ${res.status}` }).eq("id", data.invoiceId);
      const t = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No structured output from AI");
    const ext = JSON.parse(args);

    // Validation flags
    const flags: Array<{ code: string; message: string; severity: "error" | "warning" }> = [];
    if (ext.vendor_gstin && !GSTIN_RE.test(ext.vendor_gstin)) flags.push({ code: "INVALID_GSTIN", message: "Vendor GSTIN format invalid", severity: "error" });
    if (ext.buyer_gstin && !GSTIN_RE.test(ext.buyer_gstin)) flags.push({ code: "INVALID_BUYER_GSTIN", message: "Buyer GSTIN format invalid", severity: "warning" });
    const taxSum = (ext.taxable_value || 0) + (ext.cgst || 0) + (ext.sgst || 0) + (ext.igst || 0) + (ext.cess || 0);
    if (ext.total_amount && Math.abs(taxSum - ext.total_amount) > Math.max(1, ext.total_amount * 0.02)) {
      flags.push({ code: "TOTAL_MISMATCH", message: `Sum of taxable + taxes (${taxSum.toFixed(2)}) doesn't match total (${ext.total_amount})`, severity: "warning" });
    }
    if (ext.cgst > 0 && ext.igst > 0) flags.push({ code: "TAX_TYPE_CONFLICT", message: "Both CGST/SGST and IGST present", severity: "error" });
    if ((ext.confidence ?? 0) < 0.7) flags.push({ code: "LOW_CONFIDENCE", message: "AI confidence is low — please review", severity: "warning" });

    // Duplicate check
    if (ext.invoice_number && ext.vendor_gstin) {
      const { data: dup } = await supabase.from("invoices")
        .select("id").eq("invoice_number", ext.invoice_number).eq("vendor_gstin", ext.vendor_gstin)
        .neq("id", data.invoiceId).limit(1);
      if (dup && dup.length > 0) flags.push({ code: "DUPLICATE", message: "An invoice with the same number from this vendor already exists", severity: "error" });
    }

    const status = flags.some(f => f.severity === "error") ? "review" : "validated";

    await supabase.from("invoices").update({
      document_category: ext.document_category || "other",
      category_confidence: Math.min(1, Math.max(0, ext.category_confidence ?? 0)),
      vendor_name: ext.vendor_name || null,
      vendor_gstin: ext.vendor_gstin || null,
      buyer_name: ext.buyer_name || null,
      buyer_gstin: ext.buyer_gstin || null,
      invoice_number: ext.invoice_number || null,
      invoice_date: ext.invoice_date || null,
      due_date: ext.due_date || null,
      place_of_supply: ext.place_of_supply || null,
      taxable_value: ext.taxable_value || 0,
      cgst: ext.cgst || 0,
      sgst: ext.sgst || 0,
      igst: ext.igst || 0,
      cess: ext.cess || 0,
      total_amount: ext.total_amount || 0,
      currency: ext.currency || "INR",
      raw_extraction: ext,
      validation_flags: flags,
      confidence: Math.min(1, Math.max(0, ext.confidence ?? 0)),
      status,
    }).eq("id", data.invoiceId);

    if (Array.isArray(ext.items) && ext.items.length > 0) {
      await supabase.from("invoice_items").delete().eq("invoice_id", data.invoiceId);
      await supabase.from("invoice_items").insert(ext.items.map((it: any) => ({
        invoice_id: data.invoiceId,
        description: it.description || "",
        hsn: it.hsn || null,
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        taxable_value: it.taxable_value || 0,
        gst_rate: it.gst_rate || 0,
        gst_amount: it.gst_amount || 0,
      })));
    }

    return { ok: true, status, flags };
  });