# E-Invoicing & IRN Generation

Build a full e-invoicing module for IRN generation, cancellation, QR codes, deadline tracking, and per-firm IRP credential management. The integration targets NIC IRP sandbox by default, with a flip to production once tested.

## 1. Database

Single migration with two new tables + one enum.

**Enum** `irn_status`: `PENDING | GENERATED | CANCELLED | FAILED`.

**`e_invoices`** (per-IRN record, 1:1 with a CA invoice)
- `ca_firm_id`, `client_id`, `invoice_id` (FK → `ca_invoices`)
- `irn`, `irn_status`, `ack_number`, `ack_date`
- `qr_code_data` (signed QR string), `qr_code_image_url` (storage path in `invoices` bucket)
- `signed_invoice_json` (text), `irp_response_raw` (jsonb)
- `cancellation_reason`, `cancelled_at`
- `invoice_date`, `upload_deadline` (generated: `invoice_date + 30 days`)
- `days_to_deadline` computed in queries (not stored)
- Standard timestamps. Unique index on `(invoice_id)`.

**`e_invoice_settings`** (one row per CA firm)
- `ca_firm_id` (unique), `gstin`, `irp_username`, `client_id_irp`
- `irp_password_encrypted`, `irp_client_secret_encrypted` (stored encrypted via pgcrypto using a server-only `EINVOICE_ENCRYPTION_KEY`)
- `sandbox_mode` (default `true`), `is_configured`
- `last_connected_at`

**RLS**
- `e_invoices`: SELECT for `is_ca_firm_member` OR `can_access_client`; write only for `is_ca_firm_member`.
- `e_invoice_settings`: SELECT + write restricted to `is_ca_owner` (contains credentials).
- Both get standard GRANTs to `authenticated` + `service_role`. Encrypted columns are never returned to the client — server functions strip them.

## 2. IRP API client

`src/lib/einvoice.irp.server.ts` — pure server module with one IRP gateway client:
- `getAuthToken(firmId)`: caches token in-memory per `ca_firm_id` for 5h45m; refreshes on 401.
- `generateIrn(firmId, payload)`: POSTs the PEPPOL JSON, returns `{ irn, ackNo, ackDt, signedQRCode, signedInvoice }` or throws an `IrpError` with code + plain-English message (translation map).
- `cancelIrn(firmId, irn, reason)` — 24h validity check enforced before call.
- `getIrnStatus(firmId, irn)`.
- Sandbox vs production base URL selected from `e_invoice_settings.sandbox_mode`.

Payload builder maps a `ca_invoices` row + items into the IRP PEPPOL schema (SupplierGSTIN, BuyerGSTIN, InvoiceNumber, InvoiceDate, InvoiceType, SupplyType, ItemList, TotalValue, CGST/SGST/IGST).

Error-code translation table covers the common IRP codes (e.g. `2150` → "Duplicate IRN", `3028` → "GSTIN invalid", `2172` → "Invalid supply type"). Unknown codes fall back to the raw IRP message.

## 3. Server functions (`src/lib/einvoice.functions.ts`)

All gated by `requireSupabaseAuth`. Mutations use `supabaseAdmin`. Owner-only ops re-check `is_ca_owner`.

- `getEInvoiceSettings()` — returns config without secret values, plus `last_connected_at` and `is_configured`.
- `saveEInvoiceSettings(input)` — owner-only; encrypts password + secret before insert/update.
- `testIrpConnection()` — owner-only; calls `getAuthToken`, returns `{ ok, error? }`, stores `last_connected_at` on success.
- `listClientEInvoices({ clientId, filters })` — register for a client with deadline computation.
- `getEInvoiceDashboard()` — firm-wide summary cards + per-client breakdown.
- `generateIrnForInvoice({ invoiceId })` — loads invoice + items, calls `generateIrn`, upserts row, saves QR PNG into `invoices` bucket at `{ca_firm_id}/{client_id}/einvoice/{invoice_id}-qr.png`.
- `bulkGenerateIrns({ invoiceIds })` — serial loop, returns per-item result.
- `cancelIrnForInvoice({ invoiceId, reason })` — validates 24h window.
- `refreshIrnStatus({ invoiceId })`.
- `getSignedJsonDownload({ invoiceId })` — returns the signed JSON text for download.

## 4. Routes & UI

**Per-client e-invoice tab** — `src/routes/_authenticated/ca.clients.$clientId.e-invoices.tsx`
- Linked from the existing client workspace tabs.
- Top: 4 summary cards (Total this month, Pending, Deadline ≤7d, Cancelled).
- `EInvoiceRegisterTable` with the columns + status badges + deadline countdown.
- Row actions: Generate IRN, View QR, Download JSON, Cancel IRN.
- Bulk selection on PENDING rows with progress drawer.
- Sandbox banner when `sandbox_mode = true`.

**Firm-wide dashboard** — `src/routes/_authenticated/ca.e-invoices.tsx`
- Red banner when deadline-≤7d count > 0.
- 4 summary cards (Active, Pending, Deadline alert, Failed).
- Client-wise table, click-through to per-client tab.

**Settings** — `src/routes/_authenticated/ca.settings.e-invoice.tsx`
- Wizard when not configured: mode toggle, GSTIN + credentials, Test Connection.
- Configured state shows masked credentials + last connection timestamp + Edit.

**Shared components** (`src/components/einvoice/`)
- `IrnStatusBadge`, `DeadlineCountdown`, `SummaryCards`, `EInvoiceRegisterTable`, `GenerateIrnDialog`, `QrViewerDialog` (download PNG / JSON / print), `BulkProgressDrawer`, `SettingsWizard`, `SandboxBanner`, `EInvoiceClientTable`.

**PDF update** — extend `InvoicePreview.tsx` so that when the linked `e_invoices` row has `irn_status = GENERATED`, the preview shows:
- QR image top-right + IRN below it.
- "Ack No / Ack Date" line.
- Footer "Computer-generated e-invoice. Validated by IRP."

The existing PDF download path picks this up automatically.

## 5. Deadline alerts (cron)

Public hook `src/routes/api/public/hooks/einvoice-deadline-check.ts` (anon-key auth). Scheduled daily via `pg_cron`:
- 10 days before deadline → in-app notification to CA owner.
- 5 days before → in-app + (existing) email channel.
- 1 day before → urgent in-app + email.
- Day-of → dashboard banner flag + WhatsApp via existing helper.
- Monthly (1st @ 09:00) → summary notification to owner.

Reuses existing notification/WhatsApp infra; no new transport.

## 6. Out of scope (will follow in a separate prompt if needed)
- Digital Signature Certificate (DSC) signing of the JSON — IRP returns the signed JSON, we store it; we don't sign locally.
- Bulk import of historical invoices for back-dated IRN.
- E-Way Bill generation (separate IRP endpoint).
- True per-staff role gating beyond ca_owner for settings.

## Open questions (please confirm before I start)

1. **IRP credentials at build time**: I'll wire the full sandbox flow but I cannot end-to-end test without real NIC IRP sandbox credentials. OK to ship with sandbox mode default + a clearly-marked "Test Connection" button the user runs themselves?
2. **Encryption secret**: I'll request a new secret `EINVOICE_ENCRYPTION_KEY` (32-byte base64) before running migrations. Confirm.
3. **PDF QR placement**: confirm top-right corner is correct, vs. a dedicated footer block.
