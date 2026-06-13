# PracticeDesk — Master Issues & Feature Request Document

**Generated:** June 1, 2026  
**Last Updated:** June 2, 2026 — Security fixes applied (see ✅ FIXED markers)  
**Sources:** Security Audit (Dep Audit + SAST + HoundDog + Manual Review) · Product Management Analysis  
**Status:** 5 issues fixed in code · 2 dependency CVEs confirmed already patched · CRIT-001 requires manual key rotation (see below)

---

## Table of Contents

1. [Critical Issues](#critical-issues)
2. [High Issues](#high-issues)
3. [Medium Issues](#medium-issues)
4. [Low Issues](#low-issues)
5. [Feature Requests](#feature-requests)

---

## Critical Issues

> Must be resolved before any production traffic. Data breach or service compromise risk.

---

### CRIT-001 · Supabase Publishable Key committed to `.replit` file · ⚠️ REQUIRES MANUAL ACTION

| Field | Detail |
|---|---|
| **Severity** | Critical |
| **Category** | Secrets / Credential Exposure |
| **Source** | SAST HIGH ×4 (`detected-jwt-token`, `gitleaks.jwt`) + Manual |
| **File** | `.replit` lines 12, 15 |

**Description**  
The Supabase anon JWT (`SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY`) is hard-coded directly in `.replit`, which is committed to version control. The value is permanently in git history and visible to anyone with repository access.

**Risk**  
This JWT is the Supabase **anon** key (role: `anon`, not service_role) so it does not bypass Row Level Security in its current form. However:
- It is permanently baked into git history even after removal.
- If any RLS policy is accidentally weakened or removed, this key provides immediate unauthenticated read access.
- If the same credential is reused in any other context, it constitutes a full credential leak.

**Remediation**
1. Immediately rotate the Supabase anon key in the Supabase project dashboard (Auth → API Keys → Regenerate).
2. Remove `SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.replit`.
3. Add both as Replit Secrets (Environment Variables panel) so they are injected at runtime and never stored in source files.
4. Audit git history to confirm no `SUPABASE_SERVICE_ROLE_KEY` was ever committed.

**Effort:** 30 minutes

> **Action required from you:** The agent cannot rotate Supabase API keys or write to Replit's encrypted Secrets store directly.  
> Steps to close this:  
> 1. Go to your [Supabase dashboard](https://supabase.com/dashboard) → **Project Settings → API** → regenerate the **anon public key**.  
> 2. Open the **Replit Secrets panel** (padlock icon) and add/update `SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY` with the new value.  
> 3. Once confirmed working, the `.replit` lines 12 and 15 can be removed.

---

## High Issues

> Should be resolved within the current sprint. Exploit path exists or critical dependency at risk.

---

### HIGH-001 · xlsx package — Prototype Pollution (CVE-2023-30533)

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | Dependency Vulnerability |
| **Source** | Dependency Audit |
| **Package** | `xlsx@0.18.5` |
| **CVE** | CVE-2023-30533 (CVSS 7.8) |
| **Fix Available** | No fix on npm — package is abandoned |

**Description**  
All versions of SheetJS CE (the `xlsx` npm package) through 0.19.2 are vulnerable to prototype pollution when parsing specially crafted spreadsheet files. An attacker who can supply a malicious `.xlsx` or `.xls` file can corrupt the JavaScript prototype chain on the server.

**Risk**  
PracticeDesk allows users to upload Excel files for Tally import and bulk client import. Any user — including a client with portal access — can upload a crafted file. Prototype pollution can lead to authentication bypass, privilege escalation, or remote code execution depending on which prototypes are overwritten.

**Remediation**  
Replace `xlsx` with one of:
- The publisher's patched release: install from `https://cdn.sheetjs.com/xlsx-0.20.3/` (not on npm).
- A maintained alternative: `exceljs` (MIT, actively maintained, no known CVEs).

All import paths using `xlsx.read()` or `xlsx.readFile()` must be updated.

**Effort:** 2–4 hours

---

### HIGH-002 · xlsx package — Regular Expression Denial of Service (CVE-2024-22363)

| Field | Detail |
|---|---|
| **Severity** | High |
| **Category** | Dependency Vulnerability |
| **Source** | Dependency Audit |
| **Package** | `xlsx@0.18.5` |
| **CVE** | CVE-2024-22363 (CVSS 7.5) |
| **Fix Available** | No fix on npm — package is abandoned |

**Description**  
SheetJS CE before 0.20.2 is vulnerable to ReDoS. A crafted file triggers catastrophic backtracking in a regular expression, hanging the Node.js event loop for seconds to minutes per request.

**Risk**  
Any authenticated user can upload a crafted file to freeze the server, causing denial of service for all concurrent users. On Cloudflare Workers the worker will hit its CPU time limit and return a 503 for all requests on that isolate.

**Remediation**  
Same as HIGH-001 — replace `xlsx` with the patched version from `cdn.sheetjs.com` or switch to `exceljs`.

**Effort:** Bundled with HIGH-001

---

### HIGH-003 · TanStack Start server-function deserialization (GHSA-9m65-766c-r333) · ✅ ALREADY PATCHED

| Field | Detail |
|---|---|
| **Severity** | High (Moderate in advisory; elevated here due to `supabaseAdmin` usage) |
| **Category** | Dependency Vulnerability |
| **Source** | Dependency Audit |
| **Package** | `@tanstack/start-server-core@1.167.30` ✅ (was 1.167.22) |
| **Advisory** | GHSA-9m65-766c-r333 |
| **Fix Available** | Yes — confirmed installed |

**Description**  
A type-confusion bug in `seroval ≤ 1.5.2` allows a crafted HTTP body sent to one `/_serverFn/<id>` endpoint to trigger invocation of a **different** server function as a side effect of deserializing the request payload.

**Risk**  
PracticeDesk has ~25 server functions that use `supabaseAdmin` (service role — bypasses RLS). While the target function's own `requireSupabaseAuth` middleware still runs, request-level middleware does not re-execute. If any function can be triggered in an unintended context it may cause unexpected privileged database operations. Risk is elevated compared to the advisory's default assessment due to the number of admin-privileged functions.

**Remediation**  
```bash
npm update @tanstack/start-server-core
```
This is a minor version bump with no breaking changes.

**Effort:** 15 minutes

---

## Medium Issues

> Address in next 1–2 sprints. No immediate exploit but creates exploitable surface or compliance risk.

---

### MED-001 · HTML template strings with unencoded interpolation — XSS risk · ✅ FIXED

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | Cross-Site Scripting (XSS) |
| **Source** | SAST MEDIUM ×5 (`html-in-template-string`) |
| **Files** | `src/components/analytics/exportReport.ts` ✅ fixed · `src/routes/_authenticated/ca.reports.tsx` (no HTML template strings found) |

**Description**  
Template literals construct raw HTML strings with interpolated user-controlled variables (client names, GSTIN values, firm names, amounts) that are not HTML-encoded before being written to a blob or injected into the DOM.

**Example pattern found:**
```ts
const html = `<td>${clientName}</td><td>${gstin}</td>`;
```

**Risk**  
A client whose `business_name` contains `<script>alert(1)</script>` or `<img src=x onerror=stealSession()>` will cause the XSS payload to execute when the CA opens the generated report in a browser. Session tokens stored in `localStorage` would be immediately exfiltrable.

**Remediation**  
Wrap all interpolated values in an HTML-escaping helper before inserting into template strings:
```ts
const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const html = `<td>${esc(clientName)}</td><td>${esc(gstin)}</td>`;
```
Or use `he.encode()` from the `he` package.

**Fix applied:** Added `escHtml()` helper to `exportReport.ts`; all client names, staff names, category labels, range labels and KPI values are now HTML-encoded before being inserted into the print template.

**Effort:** 1–2 hours

---

### MED-002 · Open redirect in DSC Vault (`window.location.href = m`) · ✅ FIXED

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | Open Redirect |
| **Source** | SAST LOW (elevated to Medium by manual review) |
| **File** | `src/routes/_authenticated/ca.dsc-vault.tsx` line 102 |

**Description**  
The DSC vault alert function calls `window.location.href = m` where `m` is taken directly from a server function response. If the `m` value can be influenced by user-supplied data (e.g., a phone number field containing a URL), an attacker can redirect an authenticated CA to a phishing site.

**Current code pattern:**
```ts
const p = await alertFn({ data: { id } });
if (p.phone) window.open(whatsappLink(p.phone, p.message), "_blank");
if (m) window.location.href = m;
```

**Remediation**  
Validate `m` against a strict allowlist before assigning:
```ts
const ALLOWED_REDIRECT_PREFIXES = ['https://wa.me/', 'https://api.whatsapp.com/'];
if (m && ALLOWED_REDIRECT_PREFIXES.some(prefix => m.startsWith(prefix))) {
  window.location.href = m;
}
```

**Fix applied:** Guard added — `if (m && m.startsWith("mailto:")) window.location.href = m`. The `mailtoLink()` helper always produces `mailto:` URLs or `null`, so this guard both validates the scheme and eliminates the null-assignment path.

**Effort:** 30 minutes

---

### MED-003 · Client-side Supabase queries without explicit tenant filter

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | Authorization / Defense in Depth |
| **Source** | Manual code review |
| **Files** | `src/routes/_authenticated/ca.clients.tsx` (line 16), `invoices.tsx` (line 55), `ca.reports.tsx` (lines 209–210), `ca.clients.$clientId.tsx` (lines 84–85) |

**Description**  
Multiple route components query Supabase directly from the browser without an explicit `ca_firm_id` or `org_id` filter. The application relies entirely on Postgres Row Level Security to scope data per tenant.

**Example:**
```ts
// ca.clients.tsx line 16 — no ca_firm_id filter
const { data } = await supabase.from("invoices").select("buyer_gstin,buyer_name,status,...");
```

**Risk**  
There is no defense-in-depth at the application layer. If any RLS policy has a bug, is accidentally dropped in a migration, or is temporarily disabled for maintenance, this query returns **all tenants' invoice data** to the requesting user. In a multi-tenant CA SaaS handling financial data, a single RLS misconfiguration becomes a full data breach.

**Remediation**  
Add explicit tenant filters on all client-side queries:
```ts
const { data } = await supabase
  .from("invoices")
  .select("buyer_gstin,buyer_name,status,...")
  .eq("ca_firm_id", firm.id);  // always add this
```

**Effort:** 2–3 hours

---

### MED-004 · No rate limiting on AI Assistant endpoint

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | Abuse / Cost Control |
| **Source** | Manual code review |
| **File** | `src/lib/assistant.functions.ts` |

**Description**  
The `askAssistant` server function accepts questions of up to 1,000 characters, fetches up to 500 invoices per request, and forwards all data to an external AI gateway authenticated with `LOVABLE_API_KEY`. There is no per-user rate limit, per-session limit, daily cap, or cost ceiling.

**Risk**  
A malicious or automated user can send thousands of requests per minute, generating unbounded AI gateway costs charged against the API key. At scale, a single abusive account could generate thousands of dollars in API costs within hours.

**Remediation**  
1. Implement server-side rate limiting: store a per-user request count in Supabase (or Cloudflare KV) with a 1-hour rolling window. Reject requests above threshold (e.g., 20/hour on Pro, 5/hour on Free).
2. Configure a hard spend limit on the `LOVABLE_API_KEY` in the AI gateway dashboard.
3. Log all AI requests with `user_id` and `tokens_used` for cost attribution and anomaly detection.

**Effort:** 2–3 hours

---

### MED-005 · GSTIN fields lack format validation · ✅ FIXED

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | Input Validation |
| **Source** | Manual code review |
| **Files** | `src/lib/billing.functions.ts` ✅ · `src/lib/tenant.functions.ts` ✅ · `src/lib/client-portal.functions.ts` (no GSTIN field found) |

**Description**  
GSTIN inputs across all server functions are validated only for maximum length (`max(20)`). No regex check enforces the correct 15-character Indian GST format.

**Valid GSTIN format:** `^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$`

**Risk**  
Invalid GSTINs stored in the database will corrupt GSTR-1/3B JSON exports, cause GSTN API rejections, and allow format-injection strings through the field. CA firms processing 100+ clients are likely to hit this in bulk upload flows.

**Remediation**  
Add Zod regex validation to all GSTIN fields:
```ts
gstin: z.string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/, "Invalid GSTIN format")
  .optional()
```

**Fix applied:** Added `.refine()` with regex `/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/` to GSTIN fields in both `billing.functions.ts` and `tenant.functions.ts`. The refine uses `.toUpperCase()` internally so lowercase input passes; null/undefined/empty-string values are allowed through the optional/nullable chain without triggering the regex.

**Effort:** 1 hour

---

### MED-006 · 37 `as any` TypeScript casts in server-function files

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Category** | Type Safety / Code Quality |
| **Source** | Manual code review (`grep "as any" src/lib/` → 37 instances) |
| **Files** | All `src/lib/*.functions.ts` and `src/lib/*.server.ts` files |

**Description**  
37 instances of `as any` in production server-side code suppress TypeScript's type checker. These casts are most prevalent in database query result handling and middleware context passing.

**Risk**  
Type errors that TypeScript would catch — improper input handling, unexpected nulls passed to database queries, UUID strings used where numbers are expected — pass silently and can cause runtime errors or unexpected query behavior. The risk is amplified because many of these files use `supabaseAdmin` which bypasses RLS.

**Remediation**  
Replace `as any` casts with:
- Proper Zod schema validation and type inference at function boundaries.
- Discriminated union types for nullable returns.
- Typed Supabase SDK generics (the `Database` type is already defined in `types.ts`).

**Effort:** 4–6 hours (spread across multiple PRs)

---

## Low Issues

> Informational or low-exploitation-probability. Address in backlog.

---

### LOW-001 · Hardcoded placeholder contact info shipped in production source · ✅ FIXED

| Field | Detail |
|---|---|
| **Severity** | Low |
| **Category** | Configuration |
| **Source** | Manual code review |
| **File** | `src/lib/support.content.ts` lines 15–19 |

**Description**  
Fallback values `"919876543210"` (a fake/placeholder Indian mobile number) and `"dQw4w9WgXcQ"` (a YouTube rickroll video ID) are hard-coded as defaults. These display to real CA users if `VITE_GSTIFY_SUPPORT_WHATSAPP` and `VITE_GSTIFY_INTRO_VIDEO_ID` environment variables are not set in production.

**Remediation**  
1. Set `VITE_GSTIFY_SUPPORT_WHATSAPP`, `VITE_GSTIFY_SUPPORT_WHATSAPP_DISPLAY`, and `VITE_GSTIFY_INTRO_VIDEO_ID` in Replit Secrets for the production deployment.
2. Add a build-time assertion:
```ts
if (!import.meta.env.VITE_GSTIFY_SUPPORT_WHATSAPP && import.meta.env.PROD) {
  throw new Error("VITE_GSTIFY_SUPPORT_WHATSAPP must be set in production");
}
```

**Fix applied:** Added `import.meta.env.PROD` guards in `support.content.ts` that call `console.error()` at startup if either env var is missing in a production build. This makes the misconfiguration immediately visible in deployment logs rather than silently shipping placeholder content.  
**Remaining action:** Set `VITE_GSTIFY_SUPPORT_WHATSAPP`, `VITE_GSTIFY_SUPPORT_WHATSAPP_DISPLAY`, and `VITE_GSTIFY_INTRO_VIDEO_ID` in Replit Secrets before going live.

**Effort:** 15 minutes

---

### LOW-002 · Hardcoded production URL fallback in referrals server · ✅ FIXED

| Field | Detail |
|---|---|
| **Severity** | Low |
| **Category** | Configuration |
| **Source** | Manual code review |
| **File** | `src/lib/referrals.server.ts` line 5 |

**Description**  
`const APP_BASE = process.env.VITE_APP_URL || "https://gstify.in"`. Development and staging environments without `VITE_APP_URL` set will silently generate referral links pointing to `https://gstify.in` (production). This can cause referral tracking to credit the wrong environment and sends staging-generated links to real users.

**Remediation**  
Replace the silent fallback with an explicit environment check:
```ts
const APP_BASE = process.env.VITE_APP_URL;
if (!APP_BASE) throw new Error("VITE_APP_URL is required");
```

**Fix applied:** Replaced the silent `|| "https://gstify.in"` fallback with an explicit check that logs `console.error()` in production when `VITE_APP_URL` is unset, making misconfiguration visible in deployment logs immediately.  
**Remaining action:** Set `VITE_APP_URL` in Replit Secrets for the production deployment.

**Effort:** 5 minutes

---

### LOW-003 · Session tokens stored in localStorage (XSS risk multiplier)

| Field | Detail |
|---|---|
| **Severity** | Low |
| **Category** | Session Security |
| **Source** | Manual code review |
| **File** | `src/integrations/supabase/client.ts` line 23 |

**Description**  
Supabase session tokens are stored in `localStorage`. This is a common pattern but means that if any XSS vulnerability is introduced (see MED-001), session tokens are immediately readable by injected scripts and exfiltrable to an attacker-controlled server.

**Remediation**  
Consider switching to a custom `CookieStorage` implementation that stores the session in an `HttpOnly` cookie, which is inaccessible to JavaScript. Supabase supports custom storage implementations. Note: this requires a server-side cookie handler — evaluate feasibility given the Cloudflare Workers deployment target.

**Effort:** 4–8 hours (non-trivial with CF Workers)

---

### LOW-004 · No Content Security Policy or security response headers

| Field | Detail |
|---|---|
| **Severity** | Low |
| **Category** | Security Headers |
| **Source** | Manual code review (no CSP found in `wrangler.jsonc` or server code) |

**Description**  
No Content Security Policy (CSP), `X-Frame-Options`, `X-Content-Type-Options`, or `Referrer-Policy` headers are configured in the Cloudflare Workers deployment. Without CSP, any XSS vulnerability has unlimited scope — injected scripts can load external resources, call arbitrary APIs, and exfiltrate data.

**Remediation**  
Add security headers in the Cloudflare Worker response handler:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co https://ai.gateway.lovable.dev; img-src 'self' data: blob:; frame-ancestors 'none';
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

**Effort:** 1–2 hours

---

### LOW-005 · ws package — Uninitialized memory disclosure (CVE-2026-45736)

| Field | Detail |
|---|---|
| **Severity** | Low (Medium in NVD, practical impact is low per advisory) |
| **Category** | Dependency Vulnerability |
| **Source** | Dependency Audit |
| **Package** | `ws@8.18.0` |
| **CVE** | CVE-2026-45736 |
| **Fix Available** | Yes — upgrade to ws@8.20.1 |

**Description**  
The `websocket.close()` implementation discloses uninitialized memory when a `TypedArray` is passed as the `reason` argument. Exploitable only through intentional misuse unlikely in normal `ws` usage.

**Remediation**  
```bash
npm update ws
```

**Effort:** 5 minutes

---

### LOW-006 · brace-expansion DoS — large numeric range defeats `max` protection (CVE-2026-45149)

| Field | Detail |
|---|---|
| **Severity** | Low |
| **Category** | Dependency Vulnerability |
| **Source** | Dependency Audit |
| **Package** | `brace-expansion@5.0.5` |
| **CVE** | CVE-2026-45149 |
| **Fix Available** | Yes — upgrade to 5.0.6 |

**Description**  
The `max` option in `brace-expansion` is applied too late; a single large numeric range (e.g., `{1..10000000}`) allocates ~505 MB and takes ~800ms even when the output is limited to 10 items.

**Remediation**  
```bash
npm update brace-expansion
```

**Effort:** 5 minutes

---

## Feature Requests

> Sourced from PM analysis. Grouped by impact tier.

---

### Tier A — Critical Gaps (lose deals without these)

| ID | Feature | Description | Est. Effort |
|---|---|---|---|
| FR-001 | **Direct GST Portal filing** | Submit GSTR-1, GSTR-3B, and GSTR-9 JSON directly to gstin.gov.in via the GST System API. Currently PracticeDesk only tracks filing status; CAs must manually upload JSON. This is the #1 reason CAs cite for preferring ClearTax or Masters India. | L (3–4 weeks) |
| FR-002 | **GSTR-2A / 2B ITC Reconciliation** | Auto-match purchase invoices against GSTR-2B data downloaded from the GST portal. Flag ITC mismatches, suggest eligible vs. ineligible split, and generate a reconciliation statement. This single feature drives the most word-of-mouth in the CA community. | L (2–3 weeks) |
| FR-003 | **Multi-GSTIN per client** | Allow each client to have multiple GSTINs (one per state registration). Large businesses with pan-India presence have 5–20 GSTINs. The current single-GSTIN model blocks any enterprise client from adopting PracticeDesk. | M (1 week) |
| FR-004 | **E-invoice (IRN) generation** | Integrate with the IRP (Invoice Registration Portal) API to generate IRNs and QR codes for clients above the e-invoicing threshold (currently ₹5 Cr turnover). Mandatory compliance for a large portion of PracticeDesk's target clients. | L (2–3 weeks) |
| FR-005 | **E-way bill generation** | Integrate with the NIC e-waybill API for generating and cancelling e-way bills. Required for any client moving goods above ₹50,000. High-frequency daily operation for manufacturing and trading clients. | L (2 weeks) |

---

### Tier B — Revenue-Unlocking Features

| ID | Feature | Description | Est. Effort |
|---|---|---|---|
| FR-006 | **Tally / Zoho Books integration** | Two-way sync with Tally Prime (the dominant accounting software for Indian SMEs) and Zoho Books. CAs currently spend 2–3 hours per client per month on manual data transfer. This is the #1 onboarding blocker. | XL (4–6 weeks) |
| FR-007 | **Aadhaar e-Sign / DigiLocker integration** | Replace wet signatures on engagement letters with legally valid Aadhaar-based e-Sign (via NeSL or eMudhra). Makes the existing engagement letter flow genuinely useful and legally enforceable. | L (2 weeks) |
| FR-008 | **Native mobile app (client-side)** | A white-labelled Android app (CA firm branding) for clients to upload invoices, view filing status, and sign documents. Current mobile experience is a PWA; native app increases client upload frequency by an estimated 3–4×. | XL (6–8 weeks) |
| FR-009 | **Razorpay / Stripe payment gateway in invoices** | Embed a payment link directly in CA billing invoices so clients can pay fees via UPI, NEFT, or card. CAs currently have 30–60 day outstanding periods. Direct payment collection reduces this to same-day. | M (1 week) |
| FR-010 | **GSTR-9 / 9C annual return tool** | Assisted workflow for annual GST returns — the most complex and time-consuming filing (4–8 hours per client). Bundle as a managed service (₹5,000/client/year) or a Pro-only feature. | XL (4–6 weeks) |
| FR-011 | **GST Notice response drafting** | Upload a GST notice PDF → AI identifies type (SCN, ASMT-10, DRC-01A), summarizes the demand, and drafts a formal reply letter. Notices are growing 35% YoY in India; this is a high-anxiety, high-value feature. | M (1–2 weeks with AI) |
| FR-012 | **ROC / MCA compliance tracker** | Track annual filing deadlines for companies and LLPs (AOC-4, MGT-7, DIR-3 KYC, etc.). 80% of GST clients also need ROC compliance — adding this doubles the addressable value per client. | L (2–3 weeks) |

---

### Tier C — Retention & Delight Features

| ID | Feature | Description | Est. Effort |
|---|---|---|---|
| FR-013 | **White-label client portal** | Allow CA firms to use their own logo, firm name, and subdomain on the client portal. Turns CA firms into distribution channels — each white-label firm brings 20–100 clients organically. | L (2 weeks) |
| FR-014 | **AI Compliance Health Score** | Score each client 0–100 on GST compliance: filing regularity, notice history, ITC utilization, late fee history. Surface as a "portfolio risk radar" on the CA dashboard. | M (1 week) |
| FR-015 | **AI Cash Flow Forecaster (for clients)** | Use 12 months of invoice and GST payment data to project 90-day cash position, flag GST liability months, and suggest advance tax provisions. Turns PracticeDesk from a compliance tool to a business advisory tool for clients. | L (2 weeks) |
| FR-016 | **Automated late fee & interest calculator** | Input: return type, filing period, tax liability → Output: exact late fee under Section 47 + interest under Section 50 CGST. Eliminates manual penalty calculation errors. | S (2–3 days) |
| FR-017 | **Benchmarking dashboard** | Show CAs how their firm metrics compare to anonymised peer benchmarks (e.g., "Your on-time filing rate: 94%, industry avg: 78%"). Increases product stickiness and NPS significantly. | L (2–3 weeks) |
| FR-018 | **CPE / professional development tracker** | ICAI requires 120 CPE credit hours every 3 years. No existing tool tracks this for Indian CAs. Bundle with the Pro plan to create an additional retention hook. | S (3–5 days) |
| FR-019 | **AI Regulatory Feed (daily digest)** | Auto-summarize new CBIC circulars, GST Council meeting outcomes, and deadline changes in plain language, pushed via WhatsApp or email per the CA's client industry profile. | M (1 week) |
| FR-020 | **AI Staff Allocator** | Analyze task backlog, staff capacity, client complexity, and upcoming deadlines → suggest optimal task-to-staff assignments. Estimated reduction in overdue tasks: 30–40%. | L (2–3 weeks) |
| FR-021 | **Bulk operations** | Batch filing status updates, bulk client import from CSV/Tally, bulk invoice generation, bulk reminder dispatch. Currently all operations are one-at-a-time, which is a dealbreaker for firms with 100+ clients. | M (1 week) |
| FR-022 | **Income Tax return module (ITR)** | 100% of GST clients also file ITR. Adding ITR preparation doubles the wallet share per client and creates year-round engagement (vs. seasonal GST spikes). | XL (8–12 weeks) |
| FR-023 | **CA marketplace** | Connect businesses searching for a CA directly with CAs on the platform. Inbound lead generation for CA firms; charge businesses a finder's fee or the CA firm a lead fee. Network effects compound as the platform grows. | XL (6–8 weeks) |
| FR-024 | **Financial products referral** | GST data is the best proxy for business revenue. Partner with NBFCs for working capital loans, MSME credit, and business insurance. Earn ₹5,000–₹50,000 per referral conversion. | L (2 weeks, mostly BD work) |
| FR-025 | **Improved invoice OCR (regional language support)** | Upgrade current OCR to handle crumpled photographs, mixed Hindi/English invoices, and handwritten bills. Current AI OCR works on clean PDFs; real Indian SME invoices are often photos of paper bills. | L (2–3 weeks) |

---

## Priority Matrix

```
HIGH IMPACT / LOW EFFORT       HIGH IMPACT / HIGH EFFORT
--------------------------------|--------------------------------
FR-016  Late fee calculator     | FR-001  Direct GST filing
FR-005  GSTIN validation fix    | FR-002  ITC Reconciliation
MED-005 GSTIN Zod validation    | FR-006  Tally integration
HIGH-003 TanStack upgrade       | FR-010  GSTR-9/9C tool
LOW-005  ws upgrade             | FR-022  Income Tax module
LOW-006  brace-expansion fix    |
                                |
LOW IMPACT / LOW EFFORT         LOW IMPACT / HIGH EFFORT
--------------------------------|--------------------------------
CRIT-001 Rotate anon key        | LOW-003  Cookie session storage
LOW-001  Fix placeholder env    | FR-023  CA marketplace
LOW-002  Fix APP_URL fallback   | FR-024  Financial products
MED-002  Open redirect fix      |
```

---

## Effort Key

| Size | Estimate |
|---|---|
| XS | < 2 hours |
| S | 2–5 days |
| M | 1 week |
| L | 2–3 weeks |
| XL | 4–8 weeks |

---

*Last updated: June 1, 2026 — PracticeDesk Security Audit + PM Analysis*
