
# Permanent Document Vault

Google-Drive-style permanent storage layered on the existing `invoices` storage bucket and `invoices` table pattern. New dedicated tables for vault metadata, versioning, and access logging.

## 1. Database (single migration)

New enums:
- `vault_file_type` — `PDF | IMAGE | EXCEL | WORD | OTHER`
- `vault_doc_category` — `KYC | GST | INCOME_TAX | AUDIT | BANKING | CORPORATE | INVOICES | NOTICES | AGREEMENTS | OTHER`
- `vault_source` — `MANUAL_UPLOAD | CLIENT_UPLOAD | ONBOARDING | AI_EXTRACTED | GENERATED`
- `vault_access_level` — `CA_ONLY | CA_AND_CLIENT | CLIENT_ONLY`
- `vault_access_action` — `VIEWED | DOWNLOADED | SHARED | DELETED_REQUEST`

New tables (public, RLS, scoped by `ca_firm_id`):
- **document_vault** — `id`, `ca_firm_id`, `client_id`, `uploaded_by`, `file_path` (storage path in `invoices` bucket), `file_name`, `display_name`, `file_type`, `file_size_bytes`, `document_category`, `document_subcategory`, `financial_year`, `period`, `description`, `tags text[]`, `is_kyc_document`, `source`, `linked_filing_id` (FK → `compliance_deadlines`, nullable), `linked_notice_id` (nullable, no FK — notices table not yet built), `linked_invoice_id` (FK → `invoices`, nullable), `version_number int default 1`, `parent_document_id` (self FK), `is_latest_version bool default true`, `access_level`, timestamps. Indexes on `(ca_firm_id, client_id)`, `(client_id, document_category)`, `(client_id, financial_year)`, GIN on `tags`, and a `tsvector` GIN index on `display_name || subcategory || description || tags` for full-text search.
- **document_access_log** — `id`, `ca_firm_id`, `document_id` FK→document_vault, `accessed_by`, `action`, `accessed_at`, `ip_address`. Append-only.

RLS:
- `document_vault`: SELECT via `can_access_client`; for client portal users, additionally require `access_level IN ('CA_AND_CLIENT','CLIENT_ONLY')`. INSERT requires `can_access_client + uploaded_by = auth.uid()`. UPDATE/DELETE restricted to `is_ca_firm_member`.
- `document_access_log`: SELECT for `is_ca_firm_member`; INSERT for `can_access_client + accessed_by = auth.uid()`; no UPDATE/DELETE.
- GRANTs to `authenticated` + `service_role`.

Storage: reuse `invoices` bucket. Path: `{ca_firm_id}/{client_id}/vault/{uuid}-{filename}`. Bucket already private with appropriate object policies (`can_access_client` via prefix). Verify and add a storage policy if needed scoped to this prefix.

## 2. Server functions (`src/lib/vault.functions.ts` + `.server.ts`)

All with `requireSupabaseAuth`:
- `listVaultDocuments({ clientId, category?, financialYear?, fileType?, uploadedBy?, fromDate?, toDate?, search?, includeAllVersions? })` — returns latest versions by default
- `getVaultFolderTree({ clientId })` — returns counts per category and FY sub-buckets for GST/Income Tax
- `getVaultDocument({ id })` — logs VIEWED
- `getVaultSignedUrl({ id, disposition? })` — creates signed URL (5 min), logs VIEWED/DOWNLOADED
- `uploadVaultDocument({ clientId, filePath, fileName, displayName, category, subcategory, financialYear?, period?, description?, tags?, accessLevel, source? })` — single-file metadata insert after client uploads to storage
- `bulkUploadVaultDocuments({ clientId, files[] })` — bulk insert
- `updateVaultDocument({ id, ... })` — rename, edit metadata, change category/access
- `replaceVaultDocument({ id, newFilePath, newFileName })` — creates new row with `version_number = parent.version_number+1`, `parent_document_id = id`, flips parent `is_latest_version=false`
- `getVaultVersions({ documentId })` — returns version chain
- `bulkMoveVaultDocuments({ ids[], category })`
- `bulkSetAccessLevel({ ids[], accessLevel })`
- `deleteVaultDocument({ id })` — CA-only; removes storage object; KYC docs require `confirm: true`
- `getVaultStorageUsage({ caFirmId })` — sum bytes by client + total
- `searchVaultGlobal({ query })` — firm-wide search across all clients
- `getRecentVaultUploads({ caFirmId, limit })`
- `listClientVaultDocuments({ category? })` — client-portal version; filters access_level
- `downloadVaultCategoryZip({ clientId, category })` — streams a ZIP via `jszip`; logs DOWNLOADED per file

## 3. Routes & UI

```text
src/routes/_authenticated/
  ca.clients.$clientId.documents.tsx       -> Client vault main view
  ca.vault.tsx                              -> Firm-wide overview
  client.documents.tsx                      -> Client portal vault
```

Add "Documents" tab to existing `ca.clients.$clientId.tsx` and a sidebar entry "Document Vault" to CA + client portal navs.

Components in `src/components/vault/`:
- `VaultFolderTree.tsx` — collapsible category tree with FY sub-folders for GST/IT, document counts, "All Documents" root
- `VaultToolbar.tsx` — search input, upload button, filter dropdowns, view toggle, bulk action bar
- `VaultGridView.tsx` / `VaultListView.tsx` — view modes with row selection (checkbox in list view)
- `VaultDocumentCard.tsx` — thumbnail (file-type icon, image preview via signed URL), hover actions
- `VaultUploadDialog.tsx` — react-dropzone drag-and-drop, multi-file metadata form (per-file accordion), category/subcategory dropdowns mapped per category, FY picker
- `VaultViewerDialog.tsx` — full-screen viewer: PDF via `<iframe src=signedUrl>` (browser-native PDF render, no PDF.js dep) + images render as `<img>` + Office files show "Download to view"; right-side metadata panel; version history list with one-click switch
- `VaultBulkActionsBar.tsx`
- `VaultStorageCard.tsx` — usage progress bar
- `VaultStorageByClientChart.tsx` — recharts bar chart
- `VaultGlobalSearchDialog.tsx` — Cmd/Ctrl+K trigger, command palette across firm
- Client portal: `ClientVaultBrowser.tsx`, `ClientVaultCategoryDownloadButton.tsx`

Subcategory dropdown source: small static map in `src/components/vault/categories.ts` (KYC: PAN, Aadhaar, GST Cert, Incorporation, …; GST: GSTR-1, GSTR-3B, GSTR-9; etc.). Free-text fallback allowed.

Keyboard shortcut Cmd/Ctrl+K wired in CA layout (and client layout) to open `VaultGlobalSearchDialog`. If a global shortcut hook already exists, extend; otherwise add a small `useHotkey` in `src/hooks/`.

## 4. Design

- Drive-like split layout: left tree (240px, collapsible on mobile), right content scrolls independently.
- File-type colored icons via existing `lucide-react` (FileText red for PDF, FileSpreadsheet green for Excel, FileType for Word, Image for images).
- Grid cards: square thumbnail area + 2 lines metadata; hover reveals action chips.
- Storage progress bar on `/ca/vault` uses `--util-warning` past 80%, `--destructive` past 95%.
- Add CSS tokens `--vault-folder-active`, `--vault-card-hover` in `src/styles.css`.
- Bulk-select bar slides up from bottom when selection > 0.

## 5. Dependencies

- `jszip` for ZIP download
- `react-dropzone` (verify if already installed; if so reuse, else add)

## 6. Out of scope / follow-ups

- True thumbnail generation for PDFs/Office docs (use static icons + first-page preview only for images).
- Hard storage quota enforcement (display only; quotas tied to plan tier come later with billing module).
- E-signed links with expiry tracking (signed URLs are 5-min one-shot only).
- Notices linkage is wired as a nullable UUID column but no FK — notices module not yet built.
- OCR / AI auto-tagging — `source = AI_EXTRACTED` is reserved for the future invoice OCR pipeline.

## Technical notes

- Reuse `invoices` storage bucket (already configured private + per-firm pathing). No new bucket needed; saves migration churn.
- `is_latest_version` flips in a single transaction inside `replaceVaultDocument` server fn (no DB trigger needed).
- Global search uses Postgres `to_tsvector('simple', display_name || ' ' || coalesce(subcategory,'') || ' ' || coalesce(description,'') || ' ' || array_to_string(tags,' '))` with a generated column + GIN index for speed.
- Client portal RLS adds `access_level <> 'CA_ONLY'` check via a wrapper SECURITY DEFINER function `public.can_client_see_doc(_doc_id, _user_id)` to avoid policy complexity.
- Access log writes use `supabaseAdmin` inside server fns to keep RLS simple and ensure logs are always captured.
- All client portal write ops blocked by RLS (no INSERT for client users on `document_vault`).

Approve to proceed with the migration first, then server fns + UI in a follow-up batch.
