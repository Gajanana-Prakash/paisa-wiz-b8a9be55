import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useTenant } from "@/hooks/useTenant";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Home, FolderOpen, BarChart3, IndianRupee, ListChecks, Shield,
  MessageCircle, User, Menu, X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "./LanguageToggle";

const NAV_KEYS = [
  { to: "/client/dashboard/home", icon: Home, key: "home" },
  { to: "/client/documents", icon: FolderOpen, key: "documents" },
  { to: "/client/dashboard/filings", icon: BarChart3, key: "filings" },
  { to: "/client/dashboard/invoices", icon: IndianRupee, key: "invoices" },
  { to: "/client/dashboard/tasks", icon: ListChecks, key: "pending_tasks" },
  { to: "/client/dashboard/compliance", icon: Shield, key: "compliance" },
  { to: "/client/dashboard/queries", icon: MessageCircle, key: "messages_queries" },
  { to: "/client/dashboard/profile", icon: User, key: "profile" },
] as const;

export function ClientPortalShell() {
  const { firm } = useTenant();
  const { t } = useLanguage();
  const showPoweredBy = firm?.show_powered_by_gstify !== false;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {NAV_KEYS.map((item) => {
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base transition-colors ${
              active
                ? "bg-primary text-primary-foreground font-medium shadow-sm"
                : "text-foreground/80 hover:bg-muted"
            }`}
          >
            <item.icon className="size-5 shrink-0" />
            <span className="leading-snug">{t(item.key)}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="client-portal-root min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row bg-gradient-to-b from-background to-muted/30">
      <div className="lg:hidden sticky top-0 z-20 flex items-center gap-2 px-3 py-3 border-b bg-background/95 backdrop-blur">
        <Button variant="outline" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
        <div className="flex-1 text-center min-w-0 px-1">
          <p className="text-sm font-semibold truncate">{firm?.name ?? "Your CA"}</p>
          <p className="text-xs text-muted-foreground">{t("client_portal")}</p>
        </div>
        <LanguageToggle />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(100%,280px)] bg-card border-r shadow-xl flex flex-col p-4">
            <div className="flex items-center justify-between mb-4 gap-2">
              <span className="font-display font-semibold text-lg">{t("menu")}</span>
              <div className="flex items-center gap-2">
                <LanguageToggle />
                <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                  <X className="size-5" />
                </Button>
              </div>
            </div>
            <nav className="space-y-1 flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </nav>
          </aside>
        </div>
      )}

      <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r bg-card/80 p-5 gap-4">
        <div className="flex items-start justify-between gap-2 pb-4 border-b">
          <div className="min-w-0 flex-1">
            {firm?.logo_url ? (
              <img src={firm.logo_url} alt="" className="h-10 w-auto mb-2 object-contain" />
            ) : (
              <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold text-lg mb-2">
                {(firm?.name ?? "C")[0]}
              </div>
            )}
            <p className="font-display text-lg font-semibold leading-tight">{firm?.name ?? "Your CA firm"}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("client_portal")}</p>
          </div>
          <LanguageToggle className="shrink-0" />
        </div>
        <nav className="space-y-1 flex-1">
          <NavLinks />
        </nav>
      </aside>

      <div className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 text-base [&_p]:text-base [&_li]:text-base flex flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        {showPoweredBy && (
          <footer className="mt-10 pt-6 border-t text-center">
            <a
              href="https://gstify.in"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <span className="size-6 rounded-md bg-primary/10 text-primary font-bold text-xs grid place-items-center">G</span>
              {t("powered_by")}
            </a>
          </footer>
        )}
      </div>
    </div>
  );
}
