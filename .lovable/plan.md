# Client Onboarding Checklist & KYC Manager

Structured digital onboarding to replace WhatsApp back-and-forth: KYC checklist per entity type, CA review/approve flow, and OTP-signed engagement letters.

## 1. Database (single migration)

New enums:
- `entity_type_onboarding` — `PROPRIETOR | PARTNERSHIP | LLP | PRIVATE_LTD | PUBLIC_LTD | TRUST | ALL` (reuse existing `entity_type` if compatible; otherwise extend)
- `onboarding_status` — `NOT_STARTED | IN_PROGRESS | PENDING_REVIEW | COMPLETED`
- `onboarding_item_status` — `PENDING | UPLOADED | REVIEWED | APPROVED | REJECTED`
- `onboarding_doc_category` — `IDENTITY | GST | TAX | BANKING | CORPORATE | OTHER`
- `engagement_letter_status` — `DRAFT | SENT | SIGNED | EXPIRED`

New tables (all `public`, RLS on, scoped by `ca_firm_id`):
- **onboarding_templates** — `id`, `ca_firm_id`, `template_name`, `entity_type`, `description`, `is_default`, `is_system` (seeded defaults visible to all firms with `ca_firm_id IS NULL`), timestamps.
- **onboarding_template_items** — `id`, `template_id`, `item_name`, `description`, `is_mandatory`, `document_category`, `sort_order`.
- **client_onboarding** — `id`, `ca_firm_id`, `client_id` (unique), `template_id`, `status`, `completion_percentage`, `sent_at`, `completed_at`, `engagement_letter_signed`, `engagement_letter_signed_at`, `notes`, timestamps.
- **client_onboarding_items** — `id`, `onboarding_id`, `template_item_id` (nullable for custom adds), `item_name`, `description`, `is_mandatory`, `document_category`, `sort_order`, `status`, `invoice_id` (FK → existing `invoices` table used as doc vault), `rejection_reason`, `reviewed_by`, `reviewed_at`, timestamps.
- **engagement_letter_templates** — `id`, `ca_firm_id`, `name`, `content_html`, `is_default`, timestamps.
- **engagement_letters** — `id`, `ca_firm_id`, `client_id`, `template_id`, `content_html`, `status`, `sent_at`, `signed_at`, `signature_otp_hash`, `signature_otp_expires_at`, `signer_name`, `signer_ip`, `signed_document_url`, `valid_until`, `sign_token` (random URL token), timestamps.

RLS:
- All firm-scoped tables: SELECT for `is_ca_firm_member` OR `can_access_client` (client-facing rows); INSERT/UPDATE constrained accordingly; CA Owner only for template/system writes and delete.
- `onboarding_templates` system rows (`ca_firm_id IS NULL`, `is_system=true`): SELECT for any authenticated user; no UPDATE/DELETE.
- `engagement_letters` sign verification done server-side via `supabaseAdmin` + token (public endpoint).
- Standard GRANTs to `authenticated` + `service_role`.

Map "tenant_id" → `ca_firm_id`, "document_vault" → existing `invoices` table+`invoices` storage bucket (path `{ca_firm_id}/{client_id}/onboarding/...`).

## 2. Seed data

Insert 2 system templates (`ca_firm_id=NULL`, `is_system=true`, `is_default=true` per entity):
- Proprietorship (8 items per spec)
- Private Limited (Proprietorship items + 10 corporate items)

## 3. Server functions (`src/lib/onboarding.functions.ts` + `.server.ts`)

All `requireSupabaseAuth` unless noted:
- **Templates**: `listOnboardingTemplates({ entityType? })`, `getOnboardingTemplate({ id })`, `createOnboardingTemplate`, `updateOnboardingTemplate`, `deleteOnboardingTemplate`, `upsertTemplateItem`, `deleteTemplateItem`, `reorderTemplateItems`.
- **Client onboarding**: `startClientOnboarding({ clientId, templateId, customItems? })` — snapshots template items into `client_onboarding_items`; `getClientOnboarding({ clientId })`; `addOnboardingItem`, `removeOnboardingItem`; `uploadOnboardingDocument({ itemId, filePath, fileName })` — creates invoices row, links to item, sets UPLOADED; `reviewOnboardingItem({ itemId, decision, rejectionReason? })` — CA Owner/Staff; `resendOnboardingInvite`; recomputes `completion_percentage` and `status` after each change.
- **Engagement letters**:
  - Templates: `listLetterTemplates`, `createLetterTemplate`, `updateLetterTemplate`, `deleteLetterTemplate`.
  - Letters: `generateEngagementLetter({ clientId, templateId, overrides? })` — merges `{CLIENT_NAME}`, `{CA_FIRM_NAME}`, `{SERVICES_LIST}`, `{DATE}`, `{FEE_AMOUNT}`; `sendEngagementLetter({ id })` — creates sign token, status SENT; `getEngagementLetterPublic({ token })` — no auth; `requestSignatureOtp({ token, signerName, signerPhone })` — generates 6-digit OTP, stores bcrypt-ish hash (sha256 with server salt), 10-min expiry, returns dev-only code in non-prod; `verifySignatureAndSign({ token, otp, signerName })` — verifies, captures IP from request headers, generates signed PDF, uploads to `invoices` bucket, marks SIGNED, updates `client_onboarding.engagement_letter_signed`.

Signed PDF: render `content_html` + signature block to PDF via `pdf-lib` (already used elsewhere? if not, add `jspdf` which is lightweight and browser/edge compatible). Use HTML-to-PDF lite (server-side via `jspdf` from text) — acceptable v1.

OTP delivery: out of scope for actual SMS; surface OTP in toast in non-prod and via existing in-app notification for the signer's phone (or email if available). Document this as a follow-up.

## 4. Routes & UI

```text
src/routes/_authenticated/
  ca.clients.new.tsx                       -> 3-step new-client wizard
  ca.clients.$clientId.onboarding.tsx      -> onboarding tab (already a tab pattern on client detail; add new sub-route)
  ca.settings.onboarding-templates.tsx
  ca.settings.engagement-letter-templates.tsx
  client.onboarding.tsx                    -> client portal checklist
src/routes/                                
  sign-letter.$token.tsx                   -> public OTP signing flow
```

Components in `src/components/onboarding/`:
- `NewClientWizard.tsx` (3 steps: BasicDetails, TemplatePicker, SendInvite)
- `OnboardingProgressHeader.tsx` — circular progress, status badge, action buttons
- `OnboardingChecklist.tsx` — category-grouped accordion
- `OnboardingItemRow.tsx` — status icon, view doc, approve/reject buttons
- `RejectItemDialog.tsx`
- `UploadOnboardingItemDialog.tsx`
- `EngagementLetterSection.tsx`
- `EngagementLetterEditor.tsx` — rich text via existing `textarea` upgraded with simple HTML preview (skip heavy WYSIWYG; use `Textarea` + live preview pane)
- `OnboardingTemplateManager.tsx`, `TemplateItemEditor.tsx`
- `LetterTemplateManager.tsx`
- Client portal: `ClientOnboardingChecklist.tsx`, `ClientUploadButton.tsx`, `ClientLetterSignView.tsx`

Integrate into existing client detail page `ca.clients.$clientId.tsx` — add "Onboarding" tab. Add nav entries to CA sidebar Settings group: "Onboarding Templates", "Letter Templates". Client portal nav gets "Onboarding".

## 5. Design

- Wizard: stepper at top (3 dots), generous spacing, large primary button.
- Onboarding tab: circular progress ring (SVG) in `--util-good`; category sections use existing icons (User, FileText, Receipt, Wallet, Building2).
- Status pills reuse existing badge variants with semantic tokens; add `--onboarding-pending/uploaded/approved/rejected` to `src/styles.css`.
- Client portal: oversized upload tiles, friendly copy ("Snap a photo or drop a file"), camera capture via `<input capture="environment">` on mobile.

## 6. Out of scope / follow-ups

- Real SMS OTP delivery (needs SMS connector). OTP shown in-app + email-link fallback.
- True WYSIWYG editor — using textarea + HTML preview. Can swap to TipTap later.
- HTML→PDF fidelity (uses `jspdf` plain-text render with simple formatting). For pixel-perfect letters, follow-up with `@react-pdf/renderer`.
- Engagement-letter renewal reminders on `valid_until` — could plug into existing reminders module later.

## Technical notes

- Reuse `invoices` bucket; path `{ca_firm_id}/{client_id}/onboarding/{uuid}-{filename}`.
- `completion_percentage` recomputed in a SECURITY DEFINER helper called from server fns (avoids trigger complexity).
- Public signing route uses `supabaseAdmin` + token lookup; never exposes other client data.
- IP capture from `x-forwarded-for` header in server fn.
- Install: `jspdf` (small, edge-compatible).
