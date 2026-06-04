# Tally Import / Export Integration

Add a Tally interop layer so CA firms can pull data **from Tally** (XML / Excel / GSTR-1 XML) into GSTify and push GSTify invoices **back to Tally** as XML vouchers. Built additive — Tally remains the system of record where the client uses it.

## 1. Database (single migration)

**Enums**
- `tally_import_type`: `SALES_LEDGER | PURCHASE_LEDGER | GSTR1_DATA | GSTR2_DATA | FULL_BACKUP`
- `tally_version`: `TALLY_ERP9 | TALLYPRIME | UNKNOWN`
- `tally_import_status`: `UPLOADED | PROCESSING | COMPLETED | FAILED | PARTIAL`
- `tally_gst_category`: `SALES | PURCHASE | EXPENSE | ASSET`
- `tally_export_type`: `GSTR1_JSON | GSTR1_EXCEL | TALLY_XML | TALLY_VOUCHERS`

**`tally_imports`** — per upload record. Stores original file in `invoices` bucket at `{ca_firm_id}/{client_id}/tally-imports/{import_id}/{original_name}`. Columns per spec + `staging_data jsonb` (parsed-but-not-committed rows for step 4 preview). RLS: select `is_ca_firm_member OR can_access_client`; write `is_ca_firm_member`.

**`tally_mappings`** — per CA firm. Unique on `(ca_firm_id, lower(tally_ledger_name))`. RLS: members read, owners write (writes also allowed by staff for in-flow confirmations).

**`tally_exports`** — per generated export. Stored at `{ca_firm_id}/{client_id}/tally-exports/{export_id}.{ext}`. Standard RLS.

All three tables get GRANTs to `authenticated` + `service_role`, RLS enabled, policies created in the same migration.

## 2. Parsers (`src/lib/tally.parsers.server.ts`)

- **XML parser** — `fast-xml-parser` (already in tree, otherwise add). Walks `ENVELOPE.BODY.IMPORTDATA.REQUESTDATA.TALLYMESSAGE[]`. For each `VOUCHER`, extracts `DATE`, `VOUCHERNUMBER`, `PARTYLEDGERNAME`, `NARRATION`, `VOUCHERTYPENAME`, and the `LEDGERENTRIES.LIST[]` (ledger name + AMOUNT + IS-DEEMED-POSITIVE for debit/credit).
- **Excel parser** — uses existing `xlsx` lib. Recognises the standard Tally daybook columns (`Date | Voucher No | Ref No | Ref Date | Narration | Party Name | Alias | Debit | Credit | Closing Balance`); tolerant of header casing/order.
- **GSTR-1 XML / JSON** — separate path that maps GSTN sections (`b2b`, `b2cl`, `b2cs`) into invoice rows.
- **Version detector** — sniffs `<TALLYMESSAGE>` / `<ENVELOPE>` for `TallyPrime` vs `ERP 9` markers; Excel heuristic on header signature; falls back to `UNKNOWN`.
- **Normaliser** — every parser returns the same `ParsedRow[]` shape: `{ date, voucherNo, party, partyGstin?, amount, taxableValue?, cgst?, sgst?, igst?, totalTax?, ledger, narration?, rate? }`.

## 3. Mapping engine (`src/lib/tally.mapping.server.ts`)

- `extractLedgers(rows)` → unique ledger list.
- `aiSuggestMapping(ledgerName)` — heuristic first (regex on `Sales`, `Purchase`, `GST @5/12/18/28`, `Freight`, `Capital`); falls back to Lovable AI Gateway prompt when ambiguous. Returns `{ category, rate, hsn? }`.
- On import-complete, confirmed mappings are upserted into `tally_mappings` when "Save for future imports" is checked. Next import auto-applies known mappings and only prompts for new ledgers.

## 4. Duplicate detection (`src/lib/tally.dedupe.server.ts`)

For each candidate row, query `ca_invoices` + `invoices` for the same `client_id`:
- Exact: `invoice_number` + `invoice_date` → `DUPLICATE`.
- Fuzzy: party name (lowered, trimmed) + amount (±1) + date (±1 day) → `POSSIBLE_DUPLICATE`.
Returns per-row decision; UI offers skip-all / overwrite-all / review-each.

## 5. Server functions (`src/lib/tally.functions.ts`)

All `requireSupabaseAuth`, mutations via `supabaseAdmin`.
- `uploadTallyFile({ clientId, importType, file })` — stores file, creates `tally_imports` row (`UPLOADED`), returns `importId`.
- `parseTallyImport({ importId })` — runs the right parser, fills `total_records`, `staging_data`, `tally_version`, `period_from/to` (auto-detected, overridable), returns `{ ledgers, sampleRows, periodGuess }`.
- `getSuggestedMappings({ importId })` — returns per-ledger AI/heuristic suggestion + any existing `tally_mappings` hit.
- `saveMappings({ importId, mappings, persistForFuture })`.
- `previewImport({ importId })` — applies mappings, runs dedupe, returns first 10 rows + counts `{ ready, warnings, errors, duplicates }` + downloadable error report URL.
- `runImport({ importId, duplicateStrategy })` — streams insert into `ca_invoices` / `invoices`; updates progress every 25 rows; writes `error_log`, sets final `import_status`.
- `cancelImport({ importId })`.
- `listImports({ clientId })`, `getImportSummary({ importId })`, `getErrorLogDownload({ importId })`.
- `listMappings()`, `updateMapping`, `deleteMapping`, `exportMappingsCsv` — for `/ca/settings/tally-mappings`.
- `generateTallyExport({ clientId, periodFrom, periodTo, includeSales, includePurchase, includeJournal })` — builds Tally XML from `ca_invoices` (Sales/Purchase/Journal voucher templates), stores file, inserts `tally_exports` row, returns signed URL.

## 6. Routes & UI

- **`/ca/clients/$clientId/tally-import`** — wizard with stepper (1 Type → 2 Upload → 3 Mapping → 4 Preview → 5 Progress) + "Import History" tab. Components in `src/components/tally/`: `ImportTypeStep`, `UploadDropzone`, `LedgerMappingTable` (AI suggestions shown blue/italic, full-width, sticky header), `ImportPreviewTable`, `ImportProgressPanel` (polls server fn), `ImportHistoryTable`.
- **Client workspace** — add an "Import from Tally" button on the existing client page header that routes here.
- **Client documents / export panel** — add **Tally XML (Vouchers)** option to the existing export block with the period + voucher-type checkboxes and a `Generate Tally Export` action.
- **`/ca/settings/tally-mappings`** — searchable mapping library: inline edit (rate / category / HSN), delete, CSV export, reset-all guarded behind a confirm dialog. Linked from `ca.settings.tsx`.

Status colours follow the design system — red for errors, amber for warnings, green for ready, blue italic for AI suggestions.

## 7. Out of scope (separate prompt if needed)
- Live Tally ODBC / Tally Gateway TCP push (we stick to file-based round-trip).
- Two-way auto-sync / scheduled imports.
- Reconciliation of imported Tally data against GSTN portal (handled by the existing GSTR module).
- Importing Tally masters (stock items, cost centres) — only vouchers/ledger entries for now.

## Notes
- No new external secrets required. AI suggestions reuse the existing Lovable AI Gateway (`LOVABLE_API_KEY` already present).
- File parsing runs entirely in `createServerFn` handlers (Worker-safe libs only: `fast-xml-parser`, `xlsx`).
- Original upload is always saved to storage **before** parsing, so a failed parse never loses the source file.
