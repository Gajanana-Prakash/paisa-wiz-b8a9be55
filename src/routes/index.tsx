import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, FolderOpen, Bot, LayoutDashboard, ArrowRight, Check, Star } from "lucide-react";
import heroImg from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "PracticeDesk — The Practice Management Platform for CA Firms" },
      { name: "description", content: "The Practice Management Platform for CA Firms — works alongside your existing tax software. Manage clients, teams, and deadlines while you keep using CompuTax/Spectrum for filing." },
    ],
  }),
});

function Nav() {
  return (
    <header className="absolute top-0 inset-x-0 z-20">
      <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-primary-foreground">
          <div className="size-9 rounded-lg bg-[var(--gradient-gold)] grid place-items-center text-primary font-bold">P</div>
          <span className="font-display text-lg font-semibold tracking-tight">PracticeDesk</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-primary-foreground/80">
          <a href="#features" className="hover:text-primary-foreground transition">Features</a>
          <a href="#workflow" className="hover:text-primary-foreground transition">How it works</a>
          <Link to="/pricing" className="hover:text-primary-foreground transition">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login"><Button variant="ghost" className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">Sign in</Button></Link>
          <Link to="/signup"><Button className="bg-gold text-gold-foreground hover:bg-gold/90">Get started</Button></Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <Nav />
      <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{
        backgroundImage: "radial-gradient(circle at 20% 20%, oklch(0.78 0.13 85 / 0.4), transparent 40%), radial-gradient(circle at 80% 60%, oklch(0.5 0.12 160 / 0.5), transparent 50%)",
      }} />
      <div className="relative mx-auto max-w-7xl px-6 pt-36 pb-24 md:pt-40 md:pb-32 grid md:grid-cols-2 gap-12 items-center">
        <div className="text-primary-foreground">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold/40 bg-white/5 text-gold text-xs font-medium tracking-wide uppercase">
            <Sparkles className="size-3.5" /> Practice management for CA firms
          </div>
          <h1 className="mt-6 font-display text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.05]">
            Your clients. Your team. Your deadlines.{" "}
            <span className="text-gold">All organized</span> — while you keep using CompuTax/Spectrum for filing.
          </h1>
          <p className="mt-6 text-lg text-primary-foreground/75 max-w-xl">
            The Practice Management Platform for CA Firms — works alongside your existing tax software.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/signup/ca">
              <Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90 shadow-[var(--shadow-gold)]">
                Start Free Trial — For CA Firms <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
            <a href="#workflow">
              <Button size="lg" variant="outline" className="border-white/20 bg-white/5 text-primary-foreground hover:bg-white/10">
                See How It Works
              </Button>
            </a>
          </div>
          <div className="mt-10 flex items-center gap-6 text-sm text-primary-foreground/60">
            <div className="flex items-center gap-2"><Check className="size-4 text-gold"/> 14-day free trial</div>
            <div className="flex items-center gap-2"><Check className="size-4 text-gold"/> No credit card required</div>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-6 rounded-3xl bg-gold/10 blur-3xl" />
          <img src={heroImg} alt="PracticeDesk dashboard preview" width={1600} height={1200} className="relative rounded-2xl shadow-[var(--shadow-elegant)] border border-white/10" />
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: FolderOpen, title: "Client Document Portal", desc: "Give every client a simple place to upload bills and invoices — no more WhatsApp chaos.", emoji: "📁" },
  { icon: Bot, title: "AI Invoice Extraction", desc: "Auto-extract GST data from photos, PDFs, and Excel files with high accuracy.", emoji: "🤖" },
  { icon: LayoutDashboard, title: "Multi-Client Dashboard", desc: "See all your clients' filing status in one place. Track readiness at a glance.", emoji: "📊" },
];

function Features() {
  return (
    <section id="features" className="py-24 md:py-32 bg-background">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">Platform</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-semibold text-foreground">Everything you need to collaborate with clients.</h2>
          <p className="mt-4 text-muted-foreground text-lg">Three core capabilities that replace spreadsheets, WhatsApp chats, and email threads.</p>
        </div>
        <div className="mt-16 grid md:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <div key={i} className="group relative p-8 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all hover:shadow-[var(--shadow-elegant)]">
              <div className="size-12 rounded-xl bg-primary/10 grid place-items-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors text-2xl">
                <span aria-hidden>{f.emoji}</span>
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", title: "Upload anything", desc: "Drag in PDFs, scans, photos or ZIPs. We handle multi-page docs and bulk uploads." },
  { n: "02", title: "AI extracts &amp; validates", desc: "Every field captured, every GSTIN checked, every duplicate flagged — with confidence scores." },
  { n: "03", title: "Review &amp; export", desc: "Approve flagged items, then export GSTR-ready JSON, Excel or PDF in one click." },
];

function Workflow1() {
  return (
    <section id="workflow" className="py-24 md:py-32 bg-secondary/40">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">How it works</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-semibold text-foreground">From inbox to filing in minutes.</h2>
        </div>
        <div className="mt-16 grid md:grid-cols-3 gap-8">
          {STEPS.map((s, i) => (
            <div key={i} className="relative">
              <div className="font-display text-7xl font-bold text-gold/40">{s.n}</div>
              <h3 className="mt-2 font-display text-2xl font-semibold text-foreground" dangerouslySetInnerHTML={{ __html: s.title }} />
              <p className="mt-3 text-muted-foreground" dangerouslySetInnerHTML={{ __html: s.desc }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TESTIMONIALS = [
  {
    quote: "We replaced three WhatsApp groups and a shared Drive folder with PracticeDesk. Our clients actually upload on time now.",
    name: "CA Priya Menon",
    firm: "Menon & Associates, Bengaluru",
  },
  {
    quote: "Filing readiness across 60 clients in one screen. What used to take a junior two days now takes ten minutes.",
    name: "CA Rohan Shah",
    firm: "Shah Patel & Co., Ahmedabad",
  },
  {
    quote: "The client portal is so simple my smallest shop owners use it without a single training call. Game changer.",
    name: "CA Anita Krishnan",
    firm: "AK Tax Advisors, Chennai",
  },
];

function Testimonials() {
  return (
    <section className="py-24 md:py-32 bg-background">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">Loved by CA firms</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-semibold text-foreground">Practices running on PracticeDesk.</h2>
        </div>
        <div className="mt-16 grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <figure key={i} className="p-8 rounded-2xl bg-card border border-border flex flex-col">
              <div className="flex gap-1 text-gold">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} className="size-4 fill-current" />
                ))}
              </div>
              <blockquote className="mt-4 text-foreground/90 leading-relaxed flex-1">
                "{t.quote}"
              </blockquote>
              <figcaption className="mt-6 pt-6 border-t border-border">
                <div className="font-semibold text-foreground">{t.name}</div>
                <div className="text-sm text-muted-foreground">{t.firm}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const tiers = [
    {
      name: "Starter",
      price: "₹999",
      tagline: "For solo CAs getting started",
      clients: "Up to 10 clients",
      features: [
        "Basic document upload",
        "AI invoice extraction",
        "CSV & Excel exports",
        "Email support",
      ],
      highlight: false,
    },
    {
      name: "Growth",
      price: "₹2,999",
      tagline: "For growing CA practices",
      clients: "Up to 50 clients",
      features: [
        "Everything in Starter",
        "WhatsApp reminders",
        "Firm branding (logo, colors)",
        "Role-based access (RBAC)",
        "Priority support",
      ],
      highlight: true,
    },
    {
      name: "Professional",
      price: "₹6,999",
      tagline: "For established CA firms",
      clients: "Up to 200 clients",
      features: [
        "Everything in Growth",
        "Bulk multi-client exports",
        "Tally XML export",
        "Custom subdomain",
        "Dedicated success manager",
      ],
      highlight: false,
    },
  ];

  return (
    <section id="pricing" className="py-24 md:py-32 bg-background">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted/40 text-xs font-medium tracking-wide uppercase text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> Pricing for CA firms
          </div>
          <h2 className="mt-5 font-display text-4xl md:text-5xl font-semibold">Plans that scale with your practice</h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Start free for 14 days. No credit card required. Cancel anytime.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={
                "relative rounded-3xl border p-8 flex flex-col " +
                (t.highlight
                  ? "border-primary bg-card shadow-xl shadow-primary/10 md:-translate-y-2"
                  : "border-border bg-card")
              }
            >
              {t.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gold text-gold-foreground text-xs font-semibold uppercase tracking-wider">
                  Most popular
                </div>
              )}
              <div className="font-display text-xl font-semibold">{t.name}</div>
              <p className="text-sm text-muted-foreground mt-1">{t.tagline}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-display text-5xl font-semibold tracking-tight">{t.price}</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
              <div className="mt-2 text-sm font-medium text-primary">{t.clients}</div>

              <ul className="mt-6 space-y-3 text-sm flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="size-4 mt-0.5 text-primary shrink-0" />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>

              <Link to="/signup" className="mt-8">
                <Button
                  className={
                    "w-full " +
                    (t.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-foreground text-background hover:bg-foreground/90")
                  }
                  size="lg"
                >
                  Start free trial <ArrowRight className="ml-2 size-4" />
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-muted/30 p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="font-display text-lg font-semibold">14-day free trial</div>
            <p className="text-sm text-muted-foreground mt-1">
              Try PracticeDesk with up to 3 clients. No credit card required. Pick a plan whenever you're ready.
            </p>
          </div>
          <Link to="/signup/ca">
            <Button size="lg" variant="outline" className="rounded-full">
              Start your free trial <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <Link to="/pricing">
            <Button variant="outline" size="lg" className="rounded-full">
              See all plans &amp; calculator <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Per-client pricing from ₹99/client. GST invoice provided.{" "}
          <Link to="/pricing" className="underline hover:text-foreground">Full pricing →</Link>
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto max-w-7xl px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-[var(--gradient-gold)] grid place-items-center text-primary font-bold text-sm">G</div>
          <span className="font-display font-semibold text-foreground">PracticeDesk</span>
          <span className="ml-2">© {new Date().getFullYear()}</span>
        </div>
        <p>AI-assisted GST preparation. Human verification required for filing.</p>
      </div>
    </footer>
  );
}

function Landing() {
  return (
    <main>
      <Hero />
      <Features />
      <Workflow1 />
      <Testimonials />
      <Pricing />
      <Footer />
    </main>
  );
}
