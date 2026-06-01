export function ArchDiagram() {
  return (
    <div
      style={{
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        background: "#0f1117",
        minHeight: "100vh",
        padding: "40px 32px",
        color: "#f1f5f9",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        .layer { border-radius: 14px; margin-bottom: 18px; overflow: hidden; }
        .layer-header {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 18px; font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1.5px;
        }
        .layer-body { padding: 14px 16px; }
        .node-grid { display: flex; flex-wrap: wrap; gap: 10px; }
        .node {
          border-radius: 10px; padding: 10px 14px;
          font-size: 12px; font-weight: 500; line-height: 1.4;
          min-width: 120px; flex: 1;
          border: 1px solid rgba(255,255,255,0.06);
          position: relative;
        }
        .node-title { font-weight: 700; font-size: 12px; margin-bottom: 3px; }
        .node-sub { font-size: 10px; opacity: 0.65; line-height: 1.4; }
        .badge {
          display: inline-block; padding: 2px 7px; border-radius: 20px;
          font-size: 9px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.8px; margin-top: 5px; margin-right: 4px;
        }
        .arrow-row {
          display: flex; align-items: center; justify-content: center;
          gap: 8px; padding: 4px 0; color: #64748b; font-size: 11px;
        }
        .arrow-line {
          height: 28px; width: 2px; background: linear-gradient(to bottom, #334155, #1e293b);
          margin: 0 auto;
        }
        .section-divider {
          display: flex; align-items: center; gap: 12px;
          margin: 6px 0 8px; color: #475569; font-size: 10px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 1px;
        }
        .section-divider::before, .section-divider::after {
          content: ''; flex: 1; height: 1px; background: #1e293b;
        }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .four-col { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; }
        .tag-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
      `}</style>

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: "#fff"
          }}>G</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.5px" }}>GSTify</div>
            <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>Architecture Diagram</div>
          </div>
        </div>
        <div style={{ color: "#64748b", fontSize: 12 }}>AI-Powered GST Compliance & Practice Management SaaS for CA Firms</div>
      </div>

      {/* ── LAYER 1: Users ── */}
      <div className="layer" style={{ background: "#1a1f2e", border: "1px solid #2d3748" }}>
        <div className="layer-header" style={{ background: "#1e2a3a", color: "#93c5fd" }}>
          <span>👥</span> User Layer — Who Uses GSTify
        </div>
        <div className="layer-body">
          <div className="four-col">
            {[
              { icon: "🏢", title: "CA Admin", sub: "Firm owner — full access, billing, user management" },
              { icon: "👩‍💼", title: "CA Staff", sub: "Accountants — client work, filing, tasks" },
              { icon: "🤝", title: "Client", sub: "Business owner — view own GST data & docs" },
              { icon: "🔧", title: "Super Admin", sub: "Platform ops — all tenants, system config" },
            ].map((u) => (
              <div key={u.title} className="node" style={{ background: "#1e2a3a" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{u.icon}</div>
                <div className="node-title" style={{ color: "#bfdbfe" }}>{u.title}</div>
                <div className="node-sub">{u.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="arrow-line" />

      {/* ── LAYER 2: Frontend ── */}
      <div className="layer" style={{ background: "#1a1f2e", border: "1px solid #2d3748" }}>
        <div className="layer-header" style={{ background: "#1c2a1e", color: "#86efac" }}>
          <span>🖥️</span> Frontend Layer — React SPA
        </div>
        <div className="layer-body">
          <div className="two-col" style={{ marginBottom: 10 }}>
            <div className="node" style={{ background: "#1a2a1c" }}>
              <div className="node-title" style={{ color: "#4ade80" }}>Framework & Routing</div>
              <div className="node-sub">TanStack Start + TanStack Router</div>
              <div className="tag-row">
                <span className="badge" style={{ background: "#14532d", color: "#86efac" }}>React 19</span>
                <span className="badge" style={{ background: "#14532d", color: "#86efac" }}>File-based routing</span>
                <span className="badge" style={{ background: "#14532d", color: "#86efac" }}>SSR-capable</span>
              </div>
            </div>
            <div className="node" style={{ background: "#1a2a1c" }}>
              <div className="node-title" style={{ color: "#4ade80" }}>Styling & UI</div>
              <div className="node-sub">Tailwind CSS v4 + shadcn/ui components</div>
              <div className="tag-row">
                <span className="badge" style={{ background: "#14532d", color: "#86efac" }}>Radix UI</span>
                <span className="badge" style={{ background: "#14532d", color: "#86efac" }}>Lucide icons</span>
                <span className="badge" style={{ background: "#14532d", color: "#86efac" }}>Dark mode</span>
              </div>
            </div>
          </div>
          <div className="section-divider">Key Pages & Modules</div>
          <div className="three-col">
            {[
              { title: "Auth Pages", items: ["Login / Register", "Reset Password", "Email OTP Verify", "Org Onboarding"] },
              { title: "Dashboard", items: ["Stats overview", "Pending tasks", "Client summary", "Quick actions"] },
              { title: "Client Management", items: ["Client list / CRUD", "GSTIN lookup", "Document vault", "Bulk import"] },
              { title: "GST Filing", items: ["GSTR-1/3B/9 filing", "Return tracker", "Auto-fill drafts", "Filing calendar"] },
              { title: "AI Assistant", items: ["Chat interface", "Context-aware Q&A", "Policy lookups", "Notice analysis"] },
              { title: "Settings & Billing", items: ["Subscription plans", "Team management", "Roles & permissions", "Audit log"] },
            ].map((m) => (
              <div key={m.title} className="node" style={{ background: "#1a2a1c" }}>
                <div className="node-title" style={{ color: "#4ade80" }}>{m.title}</div>
                {m.items.map((i) => (
                  <div key={i} className="node-sub" style={{ paddingLeft: 0, marginTop: 2 }}>• {i}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="arrow-line" />

      {/* ── LAYER 3: Auth ── */}
      <div className="layer" style={{ background: "#1a1f2e", border: "1px solid #2d3748" }}>
        <div className="layer-header" style={{ background: "#2a1f1a", color: "#fcd34d" }}>
          <span>🔐</span> Authentication & Authorization Layer
        </div>
        <div className="layer-body">
          <div className="two-col">
            <div className="node" style={{ background: "#2a2010" }}>
              <div className="node-title" style={{ color: "#fcd34d" }}>Supabase Auth</div>
              <div className="node-sub">Email + Password (primary)</div>
              <div className="tag-row">
                <span className="badge" style={{ background: "#451a03", color: "#fcd34d" }}>JWT tokens</span>
                <span className="badge" style={{ background: "#451a03", color: "#fcd34d" }}>Session mgmt</span>
                <span className="badge" style={{ background: "#451a03", color: "#fcd34d" }}>Email OTP</span>
              </div>
            </div>
            <div className="node" style={{ background: "#2a2010" }}>
              <div className="node-title" style={{ color: "#fcd34d" }}>RBAC — Row-Level Security</div>
              <div className="node-sub">Roles: super_admin, admin, staff, client — enforced via Postgres RLS policies per tenant</div>
              <div className="tag-row">
                <span className="badge" style={{ background: "#451a03", color: "#fcd34d" }}>org_id isolation</span>
                <span className="badge" style={{ background: "#451a03", color: "#fcd34d" }}>RLS policies</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#2a2010", borderRadius: 8, border: "1px solid #451a03" }}>
            <span style={{ fontSize: 10, color: "#b45309", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Auth Flow: </span>
            <span style={{ fontSize: 11, color: "#fbbf24" }}>Login → Supabase JWT → _authenticated.tsx guard checks session → RLS enforces org isolation in every DB query</span>
          </div>
        </div>
      </div>

      <div className="arrow-line" />

      {/* ── LAYER 4: Server / Edge ── */}
      <div className="layer" style={{ background: "#1a1f2e", border: "1px solid #2d3748" }}>
        <div className="layer-header" style={{ background: "#1f1a2a", color: "#c4b5fd" }}>
          <span>⚡</span> Server / Edge Layer — TanStack Server Functions + Cloudflare Workers
        </div>
        <div className="layer-body">
          <div className="three-col">
            <div className="node" style={{ background: "#1e1a2e" }}>
              <div className="node-title" style={{ color: "#a78bfa" }}>Server Functions</div>
              <div className="node-sub">TanStack Start createServerFn() — type-safe RPC, runs on CF Workers edge</div>
              <div className="tag-row">
                <span className="badge" style={{ background: "#2e1065", color: "#c4b5fd" }}>No REST boilerplate</span>
                <span className="badge" style={{ background: "#2e1065", color: "#c4b5fd" }}>Zod validation</span>
              </div>
            </div>
            <div className="node" style={{ background: "#1e1a2e" }}>
              <div className="node-title" style={{ color: "#a78bfa" }}>Cloudflare Workers</div>
              <div className="node-sub">Edge runtime — global low-latency compute. Hosts SSR + server functions</div>
              <div className="tag-row">
                <span className="badge" style={{ background: "#2e1065", color: "#c4b5fd" }}>Edge deployment</span>
                <span className="badge" style={{ background: "#2e1065", color: "#c4b5fd" }}>Global CDN</span>
              </div>
            </div>
            <div className="node" style={{ background: "#1e1a2e" }}>
              <div className="node-title" style={{ color: "#a78bfa" }}>State Management</div>
              <div className="node-sub">TanStack Query for server state caching, optimistic updates, background refresh</div>
              <div className="tag-row">
                <span className="badge" style={{ background: "#2e1065", color: "#c4b5fd" }}>React Query v5</span>
                <span className="badge" style={{ background: "#2e1065", color: "#c4b5fd" }}>QueryClient</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="arrow-line" />

      {/* ── LAYER 5: Supabase BaaS ── */}
      <div className="layer" style={{ background: "#1a1f2e", border: "1px solid #2d3748" }}>
        <div className="layer-header" style={{ background: "#1a2228", color: "#67e8f9" }}>
          <span>🗄️</span> Backend-as-a-Service — Supabase
        </div>
        <div className="layer-body">
          <div className="four-col">
            {[
              {
                title: "PostgreSQL DB",
                color: "#22d3ee",
                bg: "#0c2030",
                items: ["Multi-tenant schema", "RLS per org_id", "14+ tables", "JSONB columns"],
              },
              {
                title: "Realtime",
                color: "#22d3ee",
                bg: "#0c2030",
                items: ["Live subscriptions", "Broadcast channel", "Presence tracking", "Collab features"],
              },
              {
                title: "Storage",
                color: "#22d3ee",
                bg: "#0c2030",
                items: ["Document vault", "GST certificates", "Invoices / notices", "Signed URL access"],
              },
              {
                title: "Edge Functions",
                color: "#22d3ee",
                bg: "#0c2030",
                items: ["Webhook handlers", "GST portal calls", "Email triggers", "Scheduled jobs"],
              },
            ].map((s) => (
              <div key={s.title} className="node" style={{ background: s.bg }}>
                <div className="node-title" style={{ color: s.color }}>{s.title}</div>
                {s.items.map((i) => (
                  <div key={i} className="node-sub" style={{ marginTop: 2 }}>• {i}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="arrow-line" />

      {/* ── LAYER 6: Database Schema ── */}
      <div className="layer" style={{ background: "#1a1f2e", border: "1px solid #2d3748" }}>
        <div className="layer-header" style={{ background: "#1f2218", color: "#a3e635" }}>
          <span>🗃️</span> Database Schema — PostgreSQL (Supabase)
        </div>
        <div className="layer-body">
          <div className="three-col">
            {[
              {
                group: "Core Tenant",
                color: "#84cc16",
                bg: "#1a2810",
                tables: [
                  { name: "organizations", cols: "id, name, gstin, plan, settings" },
                  { name: "profiles", cols: "id, org_id, role, full_name, email" },
                  { name: "subscriptions", cols: "org_id, plan_id, status, trial_end" },
                ],
              },
              {
                group: "GST Operations",
                color: "#84cc16",
                bg: "#1a2810",
                tables: [
                  { name: "gst_clients", cols: "id, org_id, gstin, trade_name, status" },
                  { name: "gst_returns", cols: "id, client_id, period, type, status" },
                  { name: "gst_notices", cols: "id, client_id, notice_type, due_date" },
                  { name: "invoices", cols: "id, client_id, amount, gst_details" },
                ],
              },
              {
                group: "Workflow & AI",
                color: "#84cc16",
                bg: "#1a2810",
                tables: [
                  { name: "tasks", cols: "id, org_id, assignee, type, status, due" },
                  { name: "ai_conversations", cols: "id, user_id, messages (JSONB)" },
                  { name: "documents", cols: "id, client_id, storage_path, type" },
                  { name: "audit_logs", cols: "id, org_id, actor, action, ts" },
                ],
              },
            ].map((g) => (
              <div key={g.group} className="node" style={{ background: g.bg }}>
                <div className="node-title" style={{ color: g.color, marginBottom: 6 }}>{g.group}</div>
                {g.tables.map((t) => (
                  <div key={t.name} style={{ marginBottom: 6, padding: "5px 7px", background: "rgba(0,0,0,0.3)", borderRadius: 6, border: "1px solid rgba(132,204,22,0.15)" }}>
                    <div style={{ color: "#bef264", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>{t.name}</div>
                    <div style={{ color: "#4b5563", fontSize: 10, fontFamily: "monospace", marginTop: 2 }}>{t.cols}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#1a2810", borderRadius: 8, border: "1px solid #1f3a10" }}>
            <span style={{ fontSize: 10, color: "#65a30d", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Multi-tenancy: </span>
            <span style={{ fontSize: 11, color: "#86efac" }}>Every table scoped by <code style={{ background: "#14532d", padding: "1px 4px", borderRadius: 3, color: "#4ade80" }}>org_id</code> — Postgres RLS policies enforce tenant isolation at DB level. No cross-tenant data leakage possible.</span>
          </div>
        </div>
      </div>

      <div className="arrow-line" />

      {/* ── LAYER 7: External APIs ── */}
      <div className="layer" style={{ background: "#1a1f2e", border: "1px solid #2d3748" }}>
        <div className="layer-header" style={{ background: "#2a1a22", color: "#f9a8d4" }}>
          <span>🔌</span> External Integrations & APIs
        </div>
        <div className="layer-body">
          <div className="four-col">
            {[
              { icon: "🤖", title: "AI / LLM", items: ["OpenAI GPT-4o", "GST Q&A bot", "Notice analysis", "Draft generation"], color: "#f472b6", bg: "#2a1020" },
              { icon: "📋", title: "GST Portal", items: ["GSTN API", "Return filing", "GSTIN lookup", "E-way bill"], color: "#f472b6", bg: "#2a1020" },
              { icon: "💳", title: "Payments", items: ["Razorpay / Stripe", "Subscription billing", "Invoice generation", "Webhook events"], color: "#f472b6", bg: "#2a1020" },
              { icon: "📧", title: "Notifications", items: ["Resend (email)", "SMS gateway", "Due date alerts", "Filing reminders"], color: "#f472b6", bg: "#2a1020" },
            ].map((e) => (
              <div key={e.title} className="node" style={{ background: e.bg }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{e.icon}</div>
                <div className="node-title" style={{ color: e.color }}>{e.title}</div>
                {e.items.map((i) => (
                  <div key={i} className="node-sub" style={{ marginTop: 2 }}>• {i}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="arrow-line" />

      {/* ── LAYER 8: Deployment ── */}
      <div className="layer" style={{ background: "#1a1f2e", border: "1px solid #2d3748" }}>
        <div className="layer-header" style={{ background: "#1a2020", color: "#5eead4" }}>
          <span>🚀</span> Deployment & Infrastructure
        </div>
        <div className="layer-body">
          <div className="three-col">
            {[
              {
                title: "Cloudflare Workers",
                color: "#2dd4bf",
                bg: "#0c2020",
                items: ["Global edge network", "Zero cold-start", "wrangler.jsonc config", "CF Pages + Workers"],
                badge: "Edge Runtime",
              },
              {
                title: "Build Pipeline",
                color: "#2dd4bf",
                bg: "#0c2020",
                items: ["Vite 7 (bundler)", "TypeScript strict", "TanStack SSR build", "npm / node v20+"],
                badge: "CI/CD ready",
              },
              {
                title: "Supabase Cloud",
                color: "#2dd4bf",
                bg: "#0c2020",
                items: ["Managed Postgres", "Global replicas", "Backups & PITR", "Dashboard & logs"],
                badge: "Managed BaaS",
              },
            ].map((d) => (
              <div key={d.title} className="node" style={{ background: d.bg }}>
                <span className="badge" style={{ background: "#042f2e", color: "#5eead4", marginBottom: 6, display: "inline-block" }}>{d.badge}</span>
                <div className="node-title" style={{ color: d.color }}>{d.title}</div>
                {d.items.map((i) => (
                  <div key={i} className="node-sub" style={{ marginTop: 2 }}>• {i}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Data Flow Legend ── */}
      <div style={{ marginTop: 18, padding: "14px 16px", background: "#141820", borderRadius: 12, border: "1px solid #1e293b" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Data Flow Summary</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            { flow: "User → Browser → Supabase Auth → JWT", color: "#fbbf24" },
            { flow: "Browser → CF Worker → Server Function → Supabase DB", color: "#818cf8" },
            { flow: "Supabase Realtime → Browser (live updates)", color: "#22d3ee" },
            { flow: "Supabase Edge Function → GST Portal API", color: "#f472b6" },
            { flow: "Server Function → OpenAI API → AI response", color: "#4ade80" },
          ].map((f) => (
            <div key={f.flow} style={{
              padding: "5px 10px", background: "#1e293b", borderRadius: 6,
              fontSize: 11, color: f.color, display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ fontSize: 8, opacity: 0.7 }}>▶</span>
              {f.flow}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 20, color: "#334155", fontSize: 10 }}>
        GSTify Architecture · TanStack Start + React 19 + Cloudflare Workers + Supabase · June 2026
      </div>
    </div>
  );
}
