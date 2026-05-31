import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useTenant } from "@/hooks/useTenant";
import {
  Home, FolderOpen, BarChart3, IndianRupee, ListChecks, Shield,
  MessageCircle, User, Menu, X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
const NAV = [
  { to: "/client/dashboard/home", icon: Home, label: "Home" },
  { to: "/client/documents", icon: FolderOpen, label: "My Documents" },
  { to: "/client/dashboard/filings", icon: BarChart3, label: "My Filings" },
  { to: "/client/dashboard/invoices", icon: IndianRupee, label: "Invoices & Payments" },
  { to: "/client/dashboard/tasks", icon: ListChecks, label: "Pending Tasks" },
  { to: "/client/dashboard/compliance", icon: Shield, label: "Compliance Status" },
  { to: "/client/dashboard/queries", icon: MessageCircle, label: "Messages & Queries" },
  { to: "/client/dashboard/profile", icon: User, label: "My Profile" },
] as const;

export function ClientPortalShell() {
  const { firm } = useTenant();
  const showPoweredBy = firm?.show_powered_by_gstify !== false;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
  <>
    {NAV.map((item) => {
      const active = pathname === item.to || pathname.startsWith(item.to + "/");
      return (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base transition-colors ${
            active
              ? "bg-primary text-primary-foreground font-medium shadow-sm"
              : "text-foreground/80 hover:bg-muted"
          }`}
        >
          <item.icon className="size-5 shrink-0" />
          <span>{item.label}</span>
        </Link>
      );
    })}
  </>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row bg-gradient-to-b from-background to-muted/30">
      <div className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur">
        <Button variant="outline" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
        <div className="flex-1 text-center min-w-0">
          <p className="text-sm font-semibold truncate">{firm?.name ?? "Your CA"}</p>
          <p className="text-xs text-muted-foreground">Client portal</p>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(100%,280px)] bg-card border-r shadow-xl flex flex-col p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-semibold text-lg">Menu</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="size-5" />
              </Button>
            </div>
            <nav className="space-y-1 flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </nav>
          </aside>
        </div>
      )}

      <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r bg-card/80 p-5 gap-4">
        <div className="pb-4 border-b">
          {firm?.logo_url ? (
            <img src={firm.logo_url} alt="" className="h-10 w-auto mb-2 object-contain" />
          ) : (
            <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold text-lg mb-2">
              {(firm?.name ?? "C")[0]}
            </div>
          )}
          <p className="font-display text-lg font-semibold leading-tight">{firm?.name ?? "Your CA firm"}</p>
          <p className="text-sm text-muted-foreground mt-1">Client self-service</p>
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
              Powered by GSTify
            </a>
          </footer>
        )}
      </div>
    </div>
  );
}
