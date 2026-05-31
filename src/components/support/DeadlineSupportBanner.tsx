import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildWhatsAppUrl,
  deadlineBannerMessage,
  shouldShowDeadlineBanner,
  type SupportTier,
} from "@/lib/support.content";
import { useServerFn } from "@tanstack/react-start";
import { logWhatsAppSupportClick } from "@/lib/support.functions";

const DISMISS_KEY = "gstify_deadline_banner_dismissed";

export function DeadlineSupportBanner({
  firmName,
  tier,
}: {
  firmName: string;
  tier: SupportTier;
}) {
  const [visible, setVisible] = useState(false);
  const logWa = useServerFn(logWhatsAppSupportClick);

  useEffect(() => {
    if (!shouldShowDeadlineBanner()) {
      setVisible(false);
      return;
    }
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const t = Number(dismissed);
      if (!Number.isNaN(t) && Date.now() - t < 24 * 60 * 60 * 1000) {
        setVisible(false);
        return;
      }
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const msg = deadlineBannerMessage(tier);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const openWhatsApp = () => {
    logWa({ data: { subject: "Deadline season support" } }).catch(() => {});
    window.open(buildWhatsAppUrl(firmName, "Filing deadline support"), "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="mb-6 rounded-2xl border border-[#b8d4ef] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ backgroundColor: "#E6F1FB" }}
    >
      <div className="flex-1 text-sm text-[#1a3a5c]">
        <span className="font-semibold">📅 {msg.title}</span>
        <p className="mt-0.5 opacity-90">{msg.body}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          className="bg-[#25D366] hover:bg-[#20bd5a] text-white border-0"
          onClick={openWhatsApp}
        >
          WhatsApp us
        </Button>
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
