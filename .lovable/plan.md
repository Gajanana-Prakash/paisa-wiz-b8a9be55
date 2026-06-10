## Bank Statement Auto-Reconciliation Module

Build a full bank reconciliation system: upload Indian bank statements (PDF/Excel/CSV), parse them, auto-match to invoices via heuristics + AI, and let CAs review/confirm in a workspace UI.

### 1. Database (single migration)

Three new tables + supporting enums:

- **`bank_statements`** — uploaded file metadata, period, opening/closing balance, reconciliation summary counters, status.
- **`bank_transactions`** — one row per parsed transaction; holds cleaned description, category, match status, matched invoice id, confidence, matched_by.
- **`reconciliation_rules`** — CA-defined auto-categorization rules (description contains + amount range → category).

Enums: `bank_account_type`, `bank_statement_file_type`, `bank_recon_status`, `bank_txn_type`, `bank_txn_category`, `bank_txn_match_status`, `bank_txn_matched_by`.

RLS: tenant-scoped via `is_ca_firm_member` / `can_access_client`; service_role full; no anon. Standard 4-step pattern (CREATE → GRANT → ENABLE RLS → POLICY). Add `updated_at` triggers.

Storage: reuse existing `invoices` bucket under path `{ca_firm_id}/{client_id}/bank-statements/{statement_id}/{filename}` (private; matches existing path convention from memory).

### 2. Server modules

**`src/lib/bank.parsers.server.ts`** — bank-specific extractors:
- HDFC / SBI / ICICI / Axis / Kotak Excel/CSV column maps using `xlsx` (already installed for Tally).
- PDF parsing: forward the file to Lovable AI Gateway (`google/gemini-2.5-flash` with file input) using the prompt from the spec → JSON array of `{date, description, debit, credit, balance}`.
- Bank auto-detection from filename + header keywords; fallback returns raw header rows so the UI can prompt for manual column mapping.

**`src/lib/bank.match.server.ts`** — matcher:
- Attempt 1: amount (±tolerance) + date ±30d + direction → 0.95.
- Attempt 2: amount + party name substring in cleaned description → 0.88.
- Attempt 3: reference number found in invoice payment ref / invoice number → 0.99.
- Auto-category keyword pass for unmatched (GST/SALARY/INTEREST/BANK CHARGES/EMI).
- Apply user `reconciliation_rules` first.

**`src/lib/bank.export.server.ts`** — Excel report builder (`xlsx`) with the 4 tabs from spec.

**`src/lib/bank.functions.ts`** — `createServerFn` endpoints (all `requireSupabaseAuth`):
- `uploadBankStatement` (signed upload URL via supabaseAdmin)
- `parseAndStageStatement` (parse → insert txns → run rules + matcher → update counters)
- `listStatements`, `getStatementDashboard` (summary + paginated txns)
- `confirmMatch`, `rejectMatch`, `manualMatch`, `excludeTxn`, `addTxnNote`, `bulkConfirm`
- `searchInvoicesForMatch` (filtered candidates panel)
- `downloadReconciliationReport` (returns base64 xlsx)
- Rules CRUD: `listReconRules`, `upsertReconRule`, `deleteReconRule`

Feature flag: `ENABLE_BANK_AI_PDF` (default `true` since Lovable AI key is present; falls back to "manual column mapping" UX when off or when PDF parsing fails).

### 3. Routes & UI

- **`/ca/clients/$clientId/bank-reconciliation`** — empty state → upload → bank/period confirmation → reconciliation dashboard (4 summary cards, progress bar, transactions table with status chips, side panel for manual match, bulk confirm bar, "Download Report" button).
- **`/ca/settings/bank-reconciliation`** — rules manager (table + add/edit dialog), tolerance + auto-exclude threshold settings (stored per firm in a small `bank_recon_settings` table or reuse `ca_firm_billing_settings` — using a dedicated `bank_recon_settings` table for clarity).
- Add link card to `/ca/settings` and a tab in client workspace nav (`ca.clients.$clientId.tsx`).

Shared components under `src/components/bank/`: `MatchStatusBadge`, `ConfidencePill`, `TxnAmount` (green credit / red debit), `ManualMatchPanel`, `MatchComparisonView` (side-by-side invoice vs txn).

### 4. Notes

- Pre-existing TS errors from agreements/client_queries persist and are out of scope.
- All security defaults applied: service_role grants, RLS via existing helper functions, no public reads.
- Original uploaded files are always stored in Storage regardless of parse success (spec requirement).
