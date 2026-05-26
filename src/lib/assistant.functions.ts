import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ question: z.string().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    const { data: invs } = await supabase
      .from("invoices")
      .select("invoice_number,invoice_date,vendor_name,vendor_gstin,buyer_name,buyer_gstin,place_of_supply,taxable_value,cgst,sgst,igst,cess,total_amount,status")
      .order("invoice_date", { ascending: false })
      .limit(500);

    const summary = {
      count: invs?.length ?? 0,
      total_taxable: invs?.reduce((s, i) => s + Number(i.taxable_value || 0), 0) ?? 0,
      total_cgst: invs?.reduce((s, i) => s + Number(i.cgst || 0), 0) ?? 0,
      total_sgst: invs?.reduce((s, i) => s + Number(i.sgst || 0), 0) ?? 0,
      total_igst: invs?.reduce((s, i) => s + Number(i.igst || 0), 0) ?? 0,
      total_cess: invs?.reduce((s, i) => s + Number(i.cess || 0), 0) ?? 0,
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an Indian GST accounting assistant. Answer questions strictly using the user's invoice data provided as JSON. Use INR (₹). Be concise. If the data is insufficient, say so. Always remind users that filings require human verification." },
          { role: "user", content: `Summary: ${JSON.stringify(summary)}\n\nInvoices (most recent first, up to 500):\n${JSON.stringify(invs ?? [])}\n\nQuestion: ${data.question}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
    const j = await res.json();
    const answer = j.choices?.[0]?.message?.content ?? "No response.";
    return { answer, summary };
  });