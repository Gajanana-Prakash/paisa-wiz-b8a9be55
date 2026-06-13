export type TutorialCategory = "getting_started" | "gst_filing" | "client_management" | "billing";
export type TutorialLang = "en" | "hi";

export type SupportTutorial = {
  id: string;
  title: string;
  titleHi?: string;
  durationMin: number;
  category: TutorialCategory;
  languages: TutorialLang[];
  youtubeId: string;
  pathPatterns: string[];
};

if (import.meta.env.PROD) {
  if (!import.meta.env.VITE_GSTIFY_SUPPORT_WHATSAPP) {
    console.error("[PracticeDesk] VITE_GSTIFY_SUPPORT_WHATSAPP is not set — support WhatsApp links will use a placeholder number. Set this env var before deploying.");
  }
  if (!import.meta.env.VITE_GSTIFY_INTRO_VIDEO_ID) {
    console.error("[PracticeDesk] VITE_GSTIFY_INTRO_VIDEO_ID is not set — intro video will use a placeholder. Set this env var before deploying.");
  }
}

export const SUPPORT_WHATSAPP_DISPLAY = import.meta.env.VITE_GSTIFY_SUPPORT_WHATSAPP_DISPLAY || "+91-98765-43210";
export const SUPPORT_WHATSAPP_E164 =
  import.meta.env.VITE_GSTIFY_SUPPORT_WHATSAPP || "919876543210";
export const SUPPORT_INTRO_YOUTUBE_ID =
  import.meta.env.VITE_GSTIFY_INTRO_VIDEO_ID || "dQw4w9WgXcQ";

export const INDIAN_CITIES = [
  "Mumbai", "Delhi NCR", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad",
  "Jaipur", "Lucknow", "Surat", "Indore", "Kochi", "Chandigarh", "Other",
] as const;

export const CLIENT_COUNT_BANDS = [
  { value: "1-10", label: "1–10 clients" },
  { value: "11-30", label: "11–30 clients" },
  { value: "31-100", label: "31–100 clients" },
  { value: "100+", label: "100+ clients" },
] as const;

export const TUTORIALS: SupportTutorial[] = [
  {
    id: "firm-setup",
    title: "Getting started — add your CA firm details",
    durationMin: 3,
    category: "getting_started",
    languages: ["en", "hi"],
    youtubeId: "dQw4w9WgXcQ",
    pathPatterns: ["/ca/settings"],
  },
  {
    id: "add-clients",
    title: "How to add and invite clients",
    durationMin: 4,
    category: "getting_started",
    languages: ["en", "hi"],
    youtubeId: "dQw4w9WgXcQ",
    pathPatterns: ["/ca/clients"],
  },
  {
    id: "client-upload",
    title: "How clients upload documents",
    durationMin: 3,
    category: "client_management",
    languages: ["en", "hi"],
    youtubeId: "dQw4w9WgXcQ",
    pathPatterns: ["/client/upload", "/client/dashboard"],
  },
  {
    id: "compliance-calendar",
    title: "Setting up compliance calendar",
    durationMin: 5,
    category: "gst_filing",
    languages: ["en"],
    youtubeId: "dQw4w9WgXcQ",
    pathPatterns: ["/ca/compliance"],
  },
  {
    id: "gstr1-export",
    title: "Generating GSTR-1 export",
    durationMin: 4,
    category: "gst_filing",
    languages: ["en"],
    youtubeId: "dQw4w9WgXcQ",
    pathPatterns: ["/ca/reports", "/invoices"],
  },
  {
    id: "tally-import",
    title: "Importing from Tally",
    durationMin: 6,
    category: "gst_filing",
    languages: ["en"],
    youtubeId: "dQw4w9WgXcQ",
    pathPatterns: ["/ca/reports", "tally"],
  },
  {
    id: "e-invoice",
    title: "Generating e-invoices (IRN)",
    durationMin: 5,
    category: "gst_filing",
    languages: ["en"],
    youtubeId: "dQw4w9WgXcQ",
    pathPatterns: ["e-invoice", "einvoic"],
  },
  {
    id: "ca-billing",
    title: "Using the billing feature for CA fees",
    durationMin: 4,
    category: "billing",
    languages: ["en"],
    youtubeId: "dQw4w9WgXcQ",
    pathPatterns: ["/ca/billing"],
  },
  {
    id: "analytics",
    title: "Understanding the analytics dashboard",
    durationMin: 5,
    category: "client_management",
    languages: ["en"],
    youtubeId: "dQw4w9WgXcQ",
    pathPatterns: ["/ca/analytics"],
  },
  {
    id: "whatsapp-reminders",
    title: "WhatsApp reminders for clients",
    durationMin: 3,
    category: "client_management",
    languages: ["en", "hi"],
    youtubeId: "dQw4w9WgXcQ",
    pathPatterns: ["/reminders", "/ca/communications"],
  },
];

export const TUTORIAL_CATEGORY_LABELS: Record<TutorialCategory | "all", string> = {
  all: "All",
  getting_started: "Getting Started",
  gst_filing: "GST Filing",
  client_management: "Client Management",
  billing: "Billing",
};

export type FaqItem = { q: string; a: string };
export type FaqSection = { title: string; items: FaqItem[] };

export const FAQ_SECTIONS: FaqSection[] = [
  {
    title: "Getting Started",
    items: [
      {
        q: "How do I add my first client?",
        a: "Go to Clients → Invite client. Enter their business name and email. They receive a link to set up their portal and can upload documents immediately.",
      },
      {
        q: "How does my client upload documents?",
        a: "Clients sign in to their PracticeDesk portal (or use the invite link) and use Upload. They can photograph bills or upload PDFs — no WhatsApp needed.",
      },
      {
        q: "Can I import my existing data from Tally?",
        a: "Yes. Use Reports → export as Tally XML, or import vouchers from your existing workflow. See the Tally import tutorial on this page.",
      },
      {
        q: "Is my client's financial data secure?",
        a: "Yes. Data is encrypted in transit and at rest, stored on servers in Mumbai, India. Access is limited to your firm and each client's own portal users.",
      },
    ],
  },
  {
    title: "GST Filing",
    items: [
      {
        q: "What file format should I use to upload invoices?",
        a: "PDF and clear photos (JPG/PNG) work best. PracticeDesk extracts key fields with AI. For bulk data, use Excel/CSV or Tally XML from Reports.",
      },
      {
        q: "How do I generate GSTR-1 JSON for portal upload?",
        a: "Open Reports, select the client and period, choose GSTR-1 JSON format, and download. Validate on the GST portal before filing.",
      },
      {
        q: "What is e-invoicing and do my clients need it?",
        a: "E-invoicing (IRN) is mandatory above turnover thresholds. PracticeDesk helps prepare invoice data; see the e-invoice tutorial for IRN workflow.",
      },
      {
        q: "How does GSTR-2A reconciliation work?",
        a: "Match purchase invoices from clients and suppliers against GSTR-2A. Use invoice review statuses and reports to flag mismatches before filing.",
      },
    ],
  },
  {
    title: "Billing & Payments",
    items: [
      {
        q: "How do I send an invoice to my client for my fees?",
        a: "Billing → New invoice. Add your fee lines, GST, and send by email or share the client portal link where they can view and upload payment proof.",
      },
      {
        q: "Does PracticeDesk generate a GST invoice for my subscription?",
        a: "Yes. Every PracticeDesk subscription payment includes a GST-compliant invoice with our GSTIN — available under Settings → Billing & subscription.",
      },
      {
        q: "Can my client pay fees directly from PracticeDesk?",
        a: "Clients can view invoices in their portal and upload UPI/bank payment proof. Direct payment gateway integration is coming soon.",
      },
    ],
  },
  {
    title: "Technical",
    items: [
      {
        q: "Does PracticeDesk work without internet?",
        a: "You need internet to sync data. You can draft work offline in your browser; changes sync when you're back online.",
      },
      {
        q: "Which browsers and devices are supported?",
        a: "Latest Chrome, Edge, Safari, and Firefox on desktop and mobile. Client upload works well on Android phones.",
      },
      {
        q: "How is my data backed up?",
        a: "Automated daily backups with point-in-time recovery on our cloud infrastructure in India.",
      },
      {
        q: "Where is my data stored?",
        a: "Mumbai, India — on servers operated for Indian data residency requirements.",
      },
    ],
  },
];

export function tutorialForPath(pathname: string): SupportTutorial | undefined {
  const lower = pathname.toLowerCase();
  for (const t of TUTORIALS) {
    if (t.pathPatterns.some((p) => lower.includes(p.toLowerCase()))) return t;
  }
  return TUTORIALS.find((t) => t.id === "firm-setup");
}

export function searchHelp(query: string): Array<{ type: "tutorial" | "faq"; title: string; id: string }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: Array<{ type: "tutorial" | "faq"; title: string; id: string }> = [];
  for (const t of TUTORIALS) {
    if (t.title.toLowerCase().includes(q)) out.push({ type: "tutorial", title: t.title, id: t.id });
  }
  for (const sec of FAQ_SECTIONS) {
    for (const item of sec.items) {
      if (item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)) {
        out.push({ type: "faq", title: item.q, id: item.q });
      }
    }
  }
  return out.slice(0, 8);
}

export function buildWhatsAppUrl(firmName: string, extraQuery?: string) {
  const text = `Hi PracticeDesk! I need help with ${firmName}. My query: ${extraQuery ?? ""}`.trim();
  return `https://wa.me/${SUPPORT_WHATSAPP_E164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function supportHoursLabel() {
  return "Mon–Sat: 9 AM – 8 PM | Sun: 10 AM – 4 PM";
}

export type SupportTier = "FREE" | "PRO" | "BUSINESS";

export const SLA_BY_TIER: Record<SupportTier, { whatsapp: string; deadline: string }> = {
  FREE: { whatsapp: "within 2 hours", deadline: "under 2 hours today" },
  PRO: { whatsapp: "within 1 hour", deadline: "under 1 hour today" },
  BUSINESS: { whatsapp: "within 30 minutes", deadline: "under 30 minutes today" },
};

/** Show banner 3 days before the 8th, 18th, or 28th of the month */
export function shouldShowDeadlineBanner(now = new Date()): boolean {
  const day = now.getDate();
  const targets = [8, 18, 28];
  return targets.some((t) => {
    const diff = t - day;
    return diff >= 0 && diff <= 3;
  });
}

export function deadlineBannerMessage(tier: SupportTier) {
  const sla = SLA_BY_TIER[tier].deadline;
  return {
    title: "Filing deadline approaching — Our support team is on standby.",
    body: `Questions? WhatsApp us: ${SUPPORT_WHATSAPP_DISPLAY} | Response time: ${sla}`,
  };
}
