
# Compliance Calendar Engine

A new module in GSTify that tracks every Indian regulatory deadline (GST, TDS, ITR, ROC/MCA, PF/ESI, Audit) for each client of a CA firm, with calendar + list views, per-client profiles, auto-generated deadlines, and reminders.

## 1. Database (one migration)

New enums:
- `compliance_category`: GST, TDS, ITR, ROC_MCA, PF_ESI, AUDIT
- `compliance_applies_to`: ALL, GST_REGISTERED, COMPANIES_ONLY, TDS_DEDUCTOR, EMPLOYER
- `compliance_recurrence`: MONTHLY, QUARTERLY, ANNUAL, EVENT_BASED
- `compliance_status`: PENDING, IN_PROGRESS, COMPLETED, OVERDUE, NOT_APPLICABLE
- `entity_type`: PROPRIETOR, PARTNERSHIP, LLP, PRIVATE_LTD, PUBLIC_LTD, TRUST

New tables (all RLS-enabled, scoped via existing `can_access_client` / `is_ca_firm_member` helpers):

- `compliance_types` — global catalogue (no tenant), readable by all authenticated users, writable only by service role. Columns: id, name, category, description, applies_to, recurrence, default_due_day, default_due_month (nullable, for annual items), is_active.
- `client_compliance_profile` — one row per client. Columns per spec + `created_at/updated_at`. Unique on `client_id`.
- `compliance_deadlines` — generated per (client, type, period). Unique on (client_id, compliance_type_id, period_label) to make generation idempotent. Indexed on (ca_firm_id, due_date) and (client_id, status).

Note: spec uses `tenant_id` — mapped to existing `ca_firm_id` column name to stay consistent with the rest of the schema. `assigned_to` references `auth.users(id)` (CA staff are users with a `ca_staff` role row, no separate `ca_staff` table exists).

RLS:
- compliance_types: SELECT to authenticated.
- client_compliance_profile / compliance_deadlines: select/update via `can_access_client`; insert/delete via `is_ca_firm_member` + client-firm membership check.

## 2. Seed data

Insert all compliance types listed in the spec. Stored with default_due_day (and default_due_month for annual). GSTR-3B quarterly uses the later of the two state dates (24) and is flagged in description.

## 3. Auto-generation logic

Server function `regenerateClientDeadlines({ clientId })`:
- Loads client profile.
- Filters `compliance_types` by `applies_to` and the profile flags.
- For each matching type, computes the deadlines that fall inside [today − 30d, end of current FY]:
  - MONTHLY → one per month from current month forward through FY end
  - QUARTERLY → one per quarter
  - ANNUAL → one for the current FY
  - EVENT_BASED → skipped (created manually)
- Upserts on (client_id, compliance_type_id, period_label) so it's safe to re-run.
- Sets status PENDING; OVERDUE is derived dynamically (and via a daily refresh) using `due_date < today`.

Called from:
- `upsertClientComplianceProfile` server fn (after profile save).
- `inviteClient` / on client creation (with default profile of all-false → no deadlines until profile filled).

## 4. Server functions (new file `src/lib/compliance.functions.ts`)

- `listComplianceTypes()` — public catalogue.
- `getClientComplianceProfile({ clientId })`.
- `upsertClientComplianceProfile({ clientId, profile })` → regenerates deadlines.
- `listFirmDeadlines({ from, to, category?, status?, assignedTo?, clientId?, search? })` — for calendar + list.
- `listClientDeadlines({ clientId })`.
- `updateDeadline({ id, patch })` — status, assigned_to, notes, filing_reference, completed_at.
- `bulkUpdateDeadlines({ ids, patch })` — for list view bulk actions.
- `getComplianceSummary()` — counts for the four summary cards (overdue, due-this-week, due-this-month, completed-this-month).
- `regenerateClientDeadlines({ clientId })` (also exposed for manual refresh).

All use `requireSupabaseAuth` + `supabaseAdmin` with explicit firm-membership checks (consistent with existing pattern in `tenant.functions.ts`).

## 5. UI

New route `src/routes/_authenticated/ca.compliance-calendar.tsx`:
- Page header + 4 summary cards (red/orange/yellow/green).
- Filter bar: Category select, Status select, Assigned Staff select, Search.
- View toggle (Calendar / List). Defaults to List on viewports < 768px.
- **Calendar view**: month grid built with `date-fns`, today highlighted (light blue), each cell shows up to 3 colored pills + a "+N more" overflow. Prev/next month + "Today" buttons.
- **List view**: deadlines grouped into "This Week / Next Week / This Month / Later". Row checkboxes for bulk actions. Sortable headers (due_date, client, type).
- Clicking a pill or row opens a `Sheet` drawer with: client name, compliance type/category, period, due date with color, assigned staff (select), status (select), notes, filing_reference, action buttons (Mark Complete, Reassign, Save).

New route `src/routes/_authenticated/ca.clients.$clientId.compliance.tsx`:
- Lives next to the existing client detail page; rendered as a section there (or accessed via tab).
- Shows that client's deadlines (list only) + an "Edit Compliance Profile" button opening a modal form with all profile fields.
- Saving the profile calls `upsertClientComplianceProfile`, which regenerates deadlines.

Add a "Compliance Calendar" link to the CA sidebar in `CADashboard`.

## 6. Notifications

In-app notifications use the existing notifications system (reused by `NotificationsBell`). Two paths:

1. On open/refresh of compliance views, server fn `evaluateDueSoonNotifications()` (idempotent — unique key per deadline + bucket "T-7" / "T-3" / "OVERDUE") inserts notification rows for any deadlines crossing the thresholds.
2. CA Dashboard shows a red banner when the current user (or their firm) has overdue deadlines.

Email reminders for "T-3" and daily overdue digests are scaffolded as a TODO note inside the server fn since they require the email infra to be set up — flagged in the closing message rather than silently enabling.

## 7. Design

Uses existing tokens from `src/styles.css` — no new colors. Status pill component maps:
- COMPLETED → muted/gray
- OVERDUE → destructive red
- due in ≤3d → orange (use `--accent` with a warm overlay, or define `--warning` / `--warning-foreground` if not present, scoped to status pills)
- due in ≤7d → yellow (`--secondary` shade)
- > 7d → primary/green tone

If `--warning` / `--info` semantic tokens aren't already defined, add minimal `oklch` tokens to `styles.css` and use them via Tailwind utility classes — no hard-coded hex.

## Technical notes

- `period_label` is canonicalized so upserts dedupe cleanly: monthly = `YYYY-MM`, quarterly = `FYxx-yy-Qn`, annual = `FYxx-yy`.
- All due dates clamped to last day of month if `default_due_day` exceeds month length (handles Feb / 30-day months).
- "Overdue" is derived in queries (`due_date < CURRENT_DATE AND status NOT IN ('COMPLETED','NOT_APPLICABLE')`) rather than stored, so it stays accurate without a cron — `status` field stores only user intent.
- File scope:
  - Migration: 1 new file under `supabase/migrations/`.
  - Server fns: `src/lib/compliance.functions.ts`.
  - UI: 2 route files + 4–5 small components under `src/components/compliance/` (CalendarGrid, DeadlinePill, DeadlineDrawer, ListView, ProfileEditor, SummaryCards).
  - Sidebar: small edit to `CADashboard`.

## Out of scope (will note in handoff)

- Email reminders (need `setup_email_infra` + scaffold step).
- Push/WhatsApp reminders.
- EVENT_BASED deadlines (manual creation only — generation skipped).
- Editing the global `compliance_types` catalogue from the UI.
