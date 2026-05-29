# Staff & Time Tracking

Adds firm-wide time tracking, staff management, and leave workflow to GSTify, plus billable-hours reports.

## 1. Database (single migration)

New enums:
- `leave_type`: CASUAL, SICK, EARNED, HALF_DAY, COMP_OFF
- `leave_status`: PENDING, APPROVED, REJECTED

New tables (all `public`, RLS on, scoped by `ca_firm_id`):

- **staff_profiles** — `id`, `ca_firm_id`, `user_id` (unique per firm), `designation`, `billing_rate_per_hour numeric`, `cost_rate_per_hour numeric`, `weekly_target_hours int default 40`, `leave_balance int default 12`, `joining_date date`, `is_active bool default true`, timestamps. One row per staff in firm.
- **time_logs** — `id`, `ca_firm_id`, `staff_user_id`, `client_id` (nullable), `task_id` (nullable), `description`, `started_at timestamptz`, `ended_at timestamptz` (nullable = running), `duration_minutes int`, `is_billable bool default true`, `billing_rate_per_hour numeric`, `billable_amount numeric`, `created_at`. Partial unique index on `(staff_user_id)` where `ended_at is null` to enforce one running timer per user.
- **leave_records** — `id`, `ca_firm_id`, `staff_user_id`, `leave_date date`, `leave_type`, `reason`, `approved_by` (nullable), `status default PENDING`, `created_at`.

RLS:
- All tables: SELECT for `is_ca_firm_member`; INSERT/UPDATE constrained to firm member; staff can only insert/update their own time_logs and leave_records; CA Owner can edit anything; only CA Owner can update leave status (approve/reject) and edit other staff's logs.
- GRANTs to `authenticated` + `service_role`.

Note: `tenant_id` in spec maps to existing `ca_firm_id`. `ca_users` maps to `user_roles` rows where role ∈ (ca_owner, ca_staff).

## 2. Server functions (`src/lib/timetracking.functions.ts` + `.server.ts`)

All protected with `requireSupabaseAuth`:
- `startTimer({ clientId?, taskId?, description?, isBillable })` — guards against existing running timer.
- `stopTimer({ timeLogId? })` — defaults to caller's running timer; computes duration + billable_amount.
- `listTimeLogs({ scope: 'firm'|'mine', filters: { staffId?, clientId?, dateFrom, dateTo, billableOnly? } })`.
- `updateTimeLog({ id, patch })` — owner of log OR CA Owner.
- `createTimeLog(input)` — manual retroactive entry.
- `deleteTimeLog({ id })` — CA Owner only.
- `listActiveTimers()` — firm-wide running timers (CA Owner) / own (staff).

Staff management:
- `listStaff()` — staff_profiles joined with profile + week_hours aggregate.
- `getStaff({ userId })` — profile + month_hours, tasks completed/overdue counts, leave history.
- `inviteStaff(input)` — reuses existing CA Staff invite flow + creates `staff_profiles` row on accept; if user already exists in firm, just upsert profile.
- `updateStaffProfile({ userId, patch })` — CA Owner only.

Leave:
- `requestLeave({ leaveDate, leaveType, reason })`.
- `decideLeave({ id, status })` — CA Owner only; decrement `leave_balance` on APPROVED.
- `listLeaveRequests({ scope })`.

Reports:
- `clientProfitabilityReport({ dateFrom, dateTo })` — aggregates by client.
- `staffUtilizationReport({ dateFrom, dateTo })` — billable% vs target.
- `monthlyBillingSummary({ year })` — totals per month.

Excel export handled client-side via `xlsx` (lightweight) — fed by the report fns.

## 3. Routes & UI

```text
src/routes/_authenticated/
  ca.timesheets.tsx             -> /ca/timesheets (Owner)
  ca.timesheets.my-timesheet.tsx -> /ca/timesheets/my-timesheet
  ca.staff.tsx                  -> /ca/staff (list, Owner only)
  ca.staff.$userId.tsx          -> /ca/staff/:userId (detail)
  ca.reports.timesheets.tsx     -> /ca/reports/timesheets
```

Components in `src/components/timetracking/`:
- `TimerWidget.tsx` — mounted in `_authenticated` topbar (visible to ca_owner + ca_staff). Popover with client/task pickers; live elapsed counter; pulsing green dot when running. Uses TanStack Query polling every 30s + local 1s interval for elapsed display.
- `ActiveTimersPanel.tsx` — owner view of running timers across firm.
- `TimesheetTable.tsx` — sortable, filterable, inline-edit. Summary footer.
- `WeeklyTargetsSidebar.tsx` — progress bar per staff vs target, green/yellow/red.
- `LogTimeDialog.tsx` — manual retroactive entry.
- `StaffListTable.tsx`, `NewStaffDialog.tsx`, `StaffDetailHeader.tsx`, `StaffPerformanceCards.tsx`.
- `LeavePanel.tsx` — staff submits; owner approves/rejects.
- `reports/ClientProfitabilityReport.tsx`, `StaffUtilizationReport.tsx`, `MonthlyBillingReport.tsx` with "Export to Excel" buttons.

Add to CA sidebar (`_authenticated.tsx` CA_NAV): "Timesheets", "Staff", and Timesheet under Reports section. Add `TimerWidget` to the topbar slot.

## 4. Design

- Timer widget: minimal button, clock icon, muted text. Running state: `bg-emerald-500/10` chip + pulsing dot (`animate-pulse`).
- Timesheet rows: `even:bg-muted/30`, dense padding.
- Progress bars: thin (`h-1.5`), use existing `Progress` component with tint via wrapper.
- Use existing `--priority-*` token pattern for utilization colors: add `--util-good`, `--util-warn`, `--util-bad` to `src/styles.css` (oklch).

## 5. Out of scope / follow-ups

- Daily timesheet reminders (email) — needs email infra; not wired.
- "Auto-block staff assignment on approved leave dates" — enforced as a soft warning in `NewTaskDialog` assignee picker, not a hard DB constraint (would require complex trigger).
- pg_cron auto-stop runaway timers — not added; UI shows warning if a timer has been running >12h.

## Technical notes

- Install: `xlsx` (SheetJS) for Excel export. Already have `date-fns`.
- Migration includes GRANTs + partial unique index for one-running-timer constraint.
- `billable_amount` computed in `stopTimer` server fn (not generated column) so manual edits stay consistent.
- Timer state lives in `time_logs` (single source of truth); widget queries `listActiveTimers` so it survives reloads/tab changes.
