import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar,
  CircleHelp,
  Play,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  buildWhatsAppUrl,
  FAQ_SECTIONS,
  SLA_BY_TIER,
  supportHoursLabel,
  TUTORIALS,
  TUTORIAL_CATEGORY_LABELS,
  type TutorialCategory,
} from "@/lib/support.content";
import { getSupportContext, logWhatsAppSupportClick, scheduleOnboardingCall } from "@/lib/support.functions";
import { WhatsAppIcon } from "@/components/support/WhatsAppIcon";
import { VideoTutorialModal } from "@/components/support/VideoTutorialModal";
import type { SupportTutorial } from "@/lib/support.content";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ca/help")({
  component: HelpSupportPage,
});

function HelpSupportPage() {
  const tutorialsRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);
  const load = useServerFn(getSupportContext);
  const logWa = useServerFn(logWhatsAppSupportClick);
  const schedule = useServerFn(scheduleOnboardingCall);

  const [category, setCategory] = useState<TutorialCategory | "all">("all");
  const [video, setVideo] = useState<SupportTutorial | null>(null);
  const [callAt, setCallAt] = useState("");
  const [booking, setBooking] = useState(false);

  const { data } = useQuery({
    queryKey: ["support-context"],
    queryFn: () => load({ data: undefined as any }),
  });

  const firmName = data?.firm?.name ?? "my firm";
  const tier = data?.tier ?? "FREE";
  const sla = SLA_BY_TIER[tier].whatsapp;

  const filtered =
    category === "all" ? TUTORIALS : TUTORIALS.filter((t) => t.category === category);

  const openWhatsApp = () => {
    logWa({ data: { subject: "Help page — Chat on WhatsApp" } }).catch(() => {});
    window.open(buildWhatsAppUrl(firmName), "_blank", "noopener,noreferrer");
  };

  const bookCall = async () => {
    if (!callAt) {
      toast.error("Pick a date and time");
      return;
    }
    setBooking(true);
    try {
      await schedule({ data: { scheduledAt: new Date(callAt).toISOString() } });
      toast.success("Onboarding call scheduled! We'll confirm on WhatsApp.");
      setCallAt("");
    } catch (e: any) {
      toast.error(e.message || "Could not schedule");
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-12">
      <div>
        <h1 className="font-display text-3xl font-semibold">Help &amp; Support</h1>
        <p className="text-muted-foreground mt-2">
          WhatsApp-first support — typical response {sla} · {supportHoursLabel()}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          GST invoice provided for all subscriptions · Data stored in Mumbai, India
        </p>
      </div>

      {/* Section 1 — Quick Help */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl border-2 border-[#25D366] bg-card p-6 flex flex-col">
          <div className="size-12 rounded-2xl bg-[#25D366]/10 text-[#25D366] grid place-items-center">
            <WhatsAppIcon className="size-7" />
          </div>
          <h2 className="mt-4 font-display font-semibold">Chat on WhatsApp</h2>
          <p className="text-sm text-muted-foreground mt-1 flex-1">
            Get help from our team {sla}
          </p>
          <p className="text-xs text-muted-foreground mt-2">{supportHoursLabel()}</p>
          <Button
            className="mt-4 w-full bg-[#25D366] hover:bg-[#20bd5a] text-white border-0"
            onClick={openWhatsApp}
          >
            Open WhatsApp Chat <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 flex flex-col">
          <div className="size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <Play className="size-6" />
          </div>
          <h2 className="mt-4 font-display font-semibold">Watch Video Tutorials</h2>
          <p className="text-sm text-muted-foreground mt-1 flex-1">
            Step-by-step guides for every feature
          </p>
          <p className="text-xs text-muted-foreground mt-2">Available in Hindi and English</p>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => tutorialsRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            Browse Tutorials <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 flex flex-col">
          <div className="size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <Calendar className="size-6" />
          </div>
          <h2 className="mt-4 font-display font-semibold">Schedule Onboarding Call</h2>
          <p className="text-sm text-muted-foreground mt-1 flex-1">
            Free 30-min walkthrough with our team
          </p>
          <p className="text-xs text-muted-foreground mt-2">We&apos;ll set up GSTify for your firm together</p>
          <div className="mt-4 space-y-2">
            <Input
              type="datetime-local"
              value={callAt}
              onChange={(e) => setCallAt(e.target.value)}
              className="text-sm"
            />
            <Button className="w-full" disabled={booking} onClick={bookCall}>
              Book a Call <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
          {data?.firm?.onboarding_call_scheduled_at && (
            <p className="text-xs text-primary mt-2">
              Scheduled:{" "}
              {new Date(data.firm.onboarding_call_scheduled_at).toLocaleString("en-IN")}
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 flex flex-col">
          <div className="size-12 rounded-2xl bg-muted grid place-items-center">
            <CircleHelp className="size-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 font-display font-semibold">Read FAQs</h2>
          <p className="text-sm text-muted-foreground mt-1 flex-1">Answers to common questions</p>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => faqRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            Browse FAQs <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </section>

      {tier === "BUSINESS" && data?.firm?.account_manager_name && (
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm">
          Your account manager: <strong>{data.firm.account_manager_name}</strong>
          {data.firm.account_manager_whatsapp && (
            <>
              {" "}
              ·{" "}
              <a
                href={buildWhatsAppUrl(firmName, "Account manager")}
                className="text-[#25D366] font-medium"
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
            </>
          )}
        </div>
      )}

      {/* Section 2 — Tutorials */}
      <section ref={tutorialsRef}>
        <h2 className="font-display text-2xl font-semibold">Video tutorial library</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(TUTORIAL_CATEGORY_LABELS) as Array<TutorialCategory | "all">).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setCategory(k)}
              className={
                "px-3 py-1 rounded-full text-xs font-medium border transition " +
                (category === k
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted")
              }
            >
              {TUTORIAL_CATEGORY_LABELS[k]}
            </button>
          ))}
        </div>

        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <article key={t.id} className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
              <div
                className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 p-4 flex items-end"
                style={{ backgroundImage: "linear-gradient(135deg, oklch(0.55 0.12 160 / 0.25), oklch(0.92 0.02 95))" }}
              >
                <p className="font-display font-semibold text-sm leading-snug text-foreground drop-shadow-sm">
                  {t.title}
                </p>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{t.durationMin} min</Badge>
                  {t.languages.includes("en") && <Badge variant="outline">English</Badge>}
                  {t.languages.includes("hi") && <Badge variant="outline">हिंदी</Badge>}
                </div>
                <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setVideo(t)}>
                  Watch Now
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Section 3 — FAQ */}
      <section ref={faqRef}>
        <h2 className="font-display text-2xl font-semibold">Frequently asked questions</h2>
        <div className="mt-6 space-y-8">
          {FAQ_SECTIONS.map((sec) => (
            <div key={sec.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {sec.title}
              </h3>
              <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card px-4">
                {sec.items.map((item) => (
                  <AccordionItem key={item.q} value={item.q}>
                    <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-sm text-muted-foreground pb-8">
        Still stuck?{" "}
        <button type="button" className="text-[#25D366] font-medium hover:underline" onClick={openWhatsApp}>
          Chat on WhatsApp
        </button>{" "}
        · <Link to="/ca/settings/billing-subscription" className="underline">Subscription &amp; GST invoices</Link>
      </p>

      <VideoTutorialModal tutorial={video} open={!!video} onOpenChange={(v) => !v && setVideo(null)} />
    </div>
  );
}
