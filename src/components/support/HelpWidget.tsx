import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { HelpCircle, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTenant } from "@/hooks/useTenant";
import { useServerFn } from "@tanstack/react-start";
import {
  buildWhatsAppUrl,
  searchHelp,
  tutorialForPath,
  TUTORIALS,
} from "@/lib/support.content";
import { logWhatsAppSupportClick } from "@/lib/support.functions";
import { WhatsAppIcon } from "./WhatsAppIcon";
import { VideoTutorialModal } from "./VideoTutorialModal";
import type { SupportTutorial } from "@/lib/support.content";

export function HelpWidget() {
  const { firm } = useTenant();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [video, setVideo] = useState<SupportTutorial | null>(null);
  const logWa = useServerFn(logWhatsAppSupportClick);

  if (!firm) return null;

  const pageTutorial = tutorialForPath(pathname);
  const results = searchHelp(query);

  const openWhatsApp = () => {
    logWa({ data: { subject: `Help widget — ${pathname}` } }).catch(() => {});
    window.open(buildWhatsAppUrl(firm.name), "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const openPageTutorial = () => {
    if (pageTutorial) {
      setVideo(pageTutorial);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 size-11 rounded-full bg-card border border-border shadow-lg grid place-items-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
        aria-label="Help"
      >
        {open ? <X className="size-5" /> : <HelpCircle className="size-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[min(100vw-2.5rem,320px)] rounded-2xl border border-border bg-card shadow-xl p-4 animate-in fade-in slide-in-from-bottom-2">
          <h3 className="font-display font-semibold text-sm">Need help with this page?</h3>
          <p className="text-xs text-muted-foreground mt-1">WhatsApp-first support for your firm</p>

          <div className="mt-3 space-y-2">
            <Button
              className="w-full justify-start gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0"
              size="sm"
              onClick={openWhatsApp}
            >
              <WhatsAppIcon className="size-4" /> Chat on WhatsApp
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={openPageTutorial}
            >
              Watch tutorial for this page
            </Button>
            {pageTutorial && (
              <p className="text-[10px] text-muted-foreground px-1 truncate" title={pageTutorial.title}>
                → {pageTutorial.title}
              </p>
            )}
          </div>

          <div className="mt-3 relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search help articles"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          {results.length > 0 && (
            <ul className="mt-2 max-h-32 overflow-y-auto text-xs space-y-1">
              {results.map((r) => (
                <li key={`${r.type}-${r.id}`}>
                  <button
                    type="button"
                    className="text-left w-full hover:text-primary truncate"
                    onClick={() => {
                      if (r.type === "tutorial") {
                        const t = TUTORIALS.find((x) => x.id === r.id);
                        if (t) setVideo(t);
                        setOpen(false);
                      }
                    }}
                  >
                    {r.type === "faq" ? "FAQ: " : ""}
                    {r.title}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/ca/help"
            className="block mt-3 text-center text-xs text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            Open full Help &amp; Support →
          </Link>
        </div>
      )}

      <VideoTutorialModal tutorial={video} open={!!video} onOpenChange={(v) => !v && setVideo(null)} />
    </>
  );
}
