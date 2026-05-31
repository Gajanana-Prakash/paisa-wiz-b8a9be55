import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess } from "./timetracking.server";
import { notifyClientPortal } from "./client-notifications.server";

const DOC_LABELS: Record<string, string> = {
  purchase_bills: "Purchase bills",
  sales_invoices: "Sales invoices",
  bank_statement: "Bank statement",
  expense_proofs: "Expense proofs",
  other: "Documents",
};

export const createDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().uuid(),
      docType: z.string().min(1),
      periodLabel: z.string().max(80).nullable().optional(),
      note: z.string().max(2000).nullable().optional(),
      dueDate: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, business_name")
      .eq("id", data.clientId)
      .eq("ca_firm_id", firmId)
      .single();
    if (!client) throw new Error("Client not found");

    const { data: row, error } = await supabaseAdmin
      .from("document_requests")
      .insert({
        ca_firm_id: firmId,
        client_id: data.clientId,
        created_by: context.userId,
        doc_type: data.docType,
        period_label: data.periodLabel ?? null,
        note: data.note ?? null,
        due_date: data.dueDate ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const label = DOC_LABELS[data.docType] ?? data.docType;
    const period = data.periodLabel ? ` for ${data.periodLabel}` : "";
    const due = data.dueDate
      ? ` by ${new Date(data.dueDate).toLocaleDateString("en-IN")}`
      : "";

    await notifyClientPortal({
      caFirmId: firmId,
      clientId: data.clientId,
      type: "document_request",
      title: "Documents requested",
      body: `Your CA needs ${label}${period}${due}.`,
      link: "/client/requests",
    });

    return { id: row!.id };
  });
