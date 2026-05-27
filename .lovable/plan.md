## Task Management System

A firm-wide task management module for CA Owners and Staff, integrated with existing clients, compliance deadlines, and notifications.

### 1. Database (single migration)

New enums:
- `task_type`: GST_FILING, TDS_RETURN, ITR_FILING, AUDIT, BOOKKEEPING, NOTICE_REPLY, DOCUMENT_COLLECTION, OTHER
- `task_priority`: LOW, MEDIUM, HIGH, URGENT
- `task_status`: TODO, IN_PROGRESS, REVIEW, COMPLETED, CANCELLED

Tables (all in `public`, RLS on, scoped by `ca_firm_id` — matching existing convention; `tenant_id` in the spec maps to our existing `ca_firm_id`):

- **tasks** — id, ca_firm_id, client_id (nullable), compliance_deadline_id (nullable), title, description, task_type, priority, assigned_to (uuid → user), created_by, due_date, estimated_hours numeric, status, period_label, is_recurring bool, recurrence_rule text, parent_task_id (self FK), completed_at, timestamps. Indexes on (ca_firm_id, status), (assigned_to, status), (client_id), (due_date).
- **task_subtasks** — id, task_id, title, is_done, sort_order, timestamps. (Spec mentions "subtasks: checklist items" in the drawer; using a lightweight checklist table rather than nested `tasks` rows.)
- **task_comments** — id, task_id, user_id, comment, created_at.
- **task_attachments** — id, task_id, file_url, file_name, uploaded_by, created_at.

RLS / GRANT pattern:
- Reuse `is_ca_firm_member`, `is_ca_owner`, `can_access_client`.
- SELECT/INSERT/UPDATE: any ca_firm_member of the firm; staff can update tasks assigned to them or that they created; CA Owner can do everything (including delete and reassign).
- Comments/attachments/subtasks: any firm member with access to the parent task; only author or CA Owner can delete.
- GRANTs to `authenticated` + `service_role`, no `anon`.

New storage bucket `task-attachments` (private), with policies scoped by `{ca_firm_id}/{task_id}/...` path.

### 2. Server functions (`src/lib/tasks.functions.ts` + `tasks.server.ts`)

All protected with `requireSupabaseAuth`:
- `listTasks({ scope: 'firm'|'mine'|'client', clientId?, filters })` — returns tasks grouped/filterable.
- `getTask({ id })` — full task with subtasks, comments, attachments, assignee profile.
- `createTask(input)` — validates with Zod, inserts task. If `is_recurring` stored only on parent.
- `updateTask({ id, patch })` — partial update; if status moves to COMPLETED and `is_recurring`, call `generateNextRecurrence` (server helper) to clone task with new `due_date` derived from `recurrence_rule` (MONTHLY/QUARTERLY/ANNUAL) and notify CA Owner via `activity_logs` + `compliance_notification_log`‑style insert (we'll use `activity_logs`).
- `addComment`, `deleteComment`.
- `addSubtask`, `toggleSubtask`, `deleteSubtask`.
- `addAttachment` (after client uploads to bucket), `deleteAttachment`.
- `listAssignableStaff({ caFirmId })` — returns CA Owner + ca_staff users in the firm.

Helper: `getEscalationCounts(caFirmId)` — returns `{ overdueHighUrgent, overdue3Plus }` for nav badge.

### 3. Routes & UI

```text
src/routes/_authenticated/
  ca.tasks.tsx                 -> /ca/tasks  (Kanban + List toggle)
  ca.tasks.my-tasks.tsx        -> /ca/tasks/my-tasks
  ca.clients.$clientId.tasks.tsx -> /ca/clients/:id/tasks (tab content)
```

Components in `src/components/tasks/`:
- `TaskBoard.tsx` — Kanban with 4 columns, drag/drop using `@dnd-kit/core` + `@dnd-kit/sortable` (installed). Optimistic status update via `useMutation`.
- `TaskListView.tsx` — table fallback, sortable by due date / priority.
- `TaskCard.tsx` — client tag, title, priority badge, assignee avatar (initials), due date pill (red if overdue, orange if today), task-type icon, comment count.
- `TaskFiltersBar.tsx` — My Tasks toggle, client/staff/type/priority/date filters, search.
- `NewTaskDialog.tsx` — full form with internal-task toggle, compliance deadline link, recurrence picker.
- `TaskDetailDrawer.tsx` — uses `Sheet`; editable fields (CA Owner / creator / assignee), subtasks checklist, comments, attachments uploader, simple activity log derived from `activity_logs`.
- `MyTasksList.tsx` — today highlighted, quick status buttons.
- `tasks/utils.ts` — date helpers (isOverdue, isToday, nextRecurrence), priority styling, type icon map.

Add "Tasks" item to CA nav in `CADashboard` / sidebar with red badge when `overdue3Plus > 0`. Inject the new "Tasks" tab into `ca.clients.$clientId.tsx` next to Compliance.

### 4. Recurring + escalation

- `generateNextRecurrence` runs inside `updateTask` when status flips to COMPLETED + `is_recurring`. Inserts `activity_logs` row "Next occurrence created" for the CA Owner.
- Escalation badge: realtime/poll `getEscalationCounts` every 60s in `NotificationsBell` parent; show on Tasks nav link.
- Add "overdue task" entries to existing `NotificationsBell` (alongside compliance overdue) for HIGH/URGENT overdue 1+ day.
- Daily 8AM digest email: defer — requires email infra (already noted as a follow-up). I'll stub the server helper `sendDailyTaskDigest` but not wire pg_cron until email domain is configured. I will call out this limitation in the final response.

### 5. Design

- Kanban columns: `bg-card` with subtle `border`, column header with status name + count badge, drag-handle cursor on cards.
- Priority colors via tokens: add `--priority-urgent/high/medium/low` in `src/styles.css` (oklch), use through Tailwind utility classes via `cn` helpers — no raw hex in components.
- Mobile: columns stack with horizontal scroll + snap (`overflow-x-auto snap-x snap-mandatory`).
- Smooth drag animation via `@dnd-kit` default transitions.

### Out of scope (called out in closing message)

- Time tracking ("Start Timer" button) — placeholder UI only; Feature 3 will own the logic.
- Daily 8AM digest email — server fn scaffolded but not scheduled; needs email infra setup first.

### Technical notes

- Install: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `date-fns` (already present, verify).
- Migration must include GRANTs per project rules.
- All server-side admin work goes through `supabaseAdmin` only where strictly needed (recurrence cloning); rest uses authenticated client so RLS applies.
- Subtasks modeled as `task_subtasks` (not nested tasks) for simpler UI/RLS — `parent_task_id` on `tasks` is kept for future nested task hierarchies as the spec defines it.
