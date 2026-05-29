import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Upload, FileText, LogOut, FileDown, Users, Sparkles,
  Search, ChevronDown, Plus, Settings, Menu, Briefcase, Loader2, Bell, KanbanSquare,
  Clock, UserCog, IndianRupee, MessagesSquare, KeyRound,
} from "lucide-react";
import { TimerWidget } from "@/components/timetracking/TimerWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationsBell } from "@/components/NotificationsBell";
import { TenantProvider, useTenant } from "@/hooks/useTenant";
import { useServerFn } from "@tanstack/react-start";
import { finalizeCAOnboarding, acceptInvite } from "@/lib/tenant.functions";
import { getEscalationCounts } from "@/lib/tasks.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: () => (<TenantProvider><TenantGate /></TenantProvider>),
});

function TenantGate() {
  const { loading, role, refresh } = useTenant();
  const finalize = useServerFn(finalizeCAOnboarding);
  const runAccept = useServerFn(acceptInvite);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (loading || role) return;
    (async () => {
      setFinalizing(true);
      try {
        const { data } = await supabase.auth.getUser();
        const meta = (data.user?.user_metadata ?? {}) as any;
        if (meta.invite_token) {
          try { await runAccept({ data: { token: meta.invite_token } }); } catch (e: any) { toast.error(e.message); }
        } else {
          // Auto-provision a CA firm so the user always lands in the dashboard.
          const firmName: string =
            meta.firm_name ||
            (meta.full_name ? `${meta.full_name}'s Firm` : null) ||
            (data.user?.email ? `${data.user.email.split("@")[0]}'s Firm` : "My CA Firm");
          try { await finalize({ data: { firmName, phone: meta.phone } }); }
          catch (e: any) { toast.error(e.message); }
        }
        await refresh();
      } finally { setFinalizing(false); }
    })();
  }, [loading, role, finalize, runAccept, refresh]);

  if (loading || finalizing) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  }
  if (!role) return <NoAccessScreen />;
  return <AppShell />;
}

function NoAccessScreen() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen grid place-items-center p-8 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-semibold">No workspace yet</h1>
        <p className="text-muted-foreground mt-2">
          You're signed in but not connected to a CA firm or client. If you're a CA, create your firm. If you're a business, ask your CA for an invite link.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <Button onClick={() => navigate({ to: "/signup/ca" })}>Create CA firm</Button>

          <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); }}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}

const CA_NAV_OWNER = [
  { to: "/ca/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/ca/clients", icon: Users, label: "Clients" },
  { to: "/ca/tasks", icon: KanbanSquare, label: "Tasks", badgeKey: "tasksOverdue" as const },
  { to: "/ca/timesheets", icon: Clock, label: "Timesheets" },
  { to: "/ca/staff", icon: UserCog, label: "Staff" },
  { to: "/ca/billing", icon: IndianRupee, label: "Billing" },
  { to: "/ca/communications", icon: MessagesSquare, label: "Communications" },
  { to: "/ca/dsc-vault", icon: KeyRound, label: "DSC Vault" },
  { to: "/ca/reports", icon: FileDown, label: "Reports" },
  { to: "/invoices", icon: FileText, label: "Invoices" },
  { to: "/reminders", icon: Bell, label: "Reminders" },
  { to: "/assistant", icon: Sparkles, label: "AI Assistant" },
] as const;

const CA_NAV_STAFF = [
  { to: "/ca/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/ca/clients", icon: Users, label: "Clients" },
  { to: "/ca/tasks/my-tasks", icon: KanbanSquare, label: "My tasks" },
  { to: "/ca/timesheets/my-timesheet", icon: Clock, label: "My timesheet" },
  { to: "/ca/dsc-vault", icon: KeyRound, label: "DSC Vault" },
  { to: "/invoices", icon: FileText, label: "Invoices" },
  { to: "/reminders", icon: Bell, label: "Reminders" },
  { to: "/assistant", icon: Sparkles, label: "AI Assistant" },
] as const;

const CLIENT_NAV = [
  { to: "/client/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/client/upload", icon: Upload, label: "Upload Invoices" },
  { to: "/client/requests", icon: Bell, label: "Requests" },
  { to: "/invoices", icon: FileText, label: "Invoices" },
  { to: "/assistant", icon: Sparkles, label: "AI Assistant" },
] as const;

function AppShell() {
  const navigate = useNavigate();
  const { role, userId, firm, availableClients, activeClientId, setActiveClientId, activeClient } = useTenant();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [tasksOverdue, setTasksOverdue] = useState(0);
  const loadEscalation = useServerFn(getEscalationCounts);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const isCA = role === "ca_owner" || role === "ca_staff";

  useEffect(() => {
    if (!isCA) return;
    let cancelled = false;
    const refresh = () => loadEscalation({ data: undefined as any })
      .then((r: any) => { if (!cancelled) setTasksOverdue(r?.overdueTotal ?? 0); })
      .catch(() => {});
    refresh();
    const t = setInterval(refresh, 60_000);
    const ch = supabase
      .channel("nav-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refresh)
      .subscribe();
    return () => { cancelled = true; clearInterval(t); supabase.removeChannel(ch); };
  }, [isCA, loadEscalation]);

  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/" }); };
  const initials = email ? email.slice(0, 2).toUpperCase() : "GS";

  const nav = isCA ? (role === "ca_owner" ? CA_NAV_OWNER : CA_NAV_STAFF) : CLIENT_NAV;
  const settingsTo = isCA ? "/ca/settings" : "/client/dashboard";
  const uploadTo = isCA ? "/ca/clients" : "/client/upload";

  const badges: Record<string, number> = { tasksOverdue };


  const SidebarInner = (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      <Link to="/" className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border/50">
        <div className="size-9 rounded-xl bg-[var(--gradient-gold)] grid place-items-center text-primary font-bold shadow-[var(--shadow-gold)]">G</div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-display text-base font-semibold">GSTify</div>
            <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">AI Tax Suite</div>
          </div>
        )}
      </Link>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {!collapsed && <div className="px-3 pb-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/40">Workspace</div>}
        {nav.map((i) => {
          const badge = (i as any).badgeKey ? badges[(i as any).badgeKey] : 0;
          return (
            <Link
              key={i.to}
              to={i.to}
              onClick={() => setMobileOpen(false)}
              activeProps={{ className: "bg-sidebar-accent text-sidebar-primary shadow-sm border-sidebar-primary/30" }}
              inactiveProps={{ className: "text-sidebar-foreground/80 border-transparent" }}
              className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm border hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all"
              title={collapsed ? i.label : undefined}
            >
              <i.icon className="size-[18px] shrink-0" />
              {!collapsed && <span className="font-medium flex-1">{i.label}</span>}
              {badge > 0 && (
                <span className={`${collapsed ? "absolute top-1 right-1" : ""} min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold grid place-items-center`}>
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {!collapsed && firm && (
        <div className="px-4 py-3 border-t border-sidebar-border/50 text-[11px] text-sidebar-foreground/60">
          <div className="uppercase tracking-widest text-[9px]">Workspace</div>
          <div className="font-medium text-sidebar-foreground truncate">{firm.name}</div>
          <div className="mt-0.5 opacity-70 capitalize">{role?.replace("_", " ")}</div>
        </div>
      )}
      <div className="p-3 border-t border-sidebar-border/50 space-y-1">
        <Link to={settingsTo} onClick={() => setMobileOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition" title="Settings">
          <Settings className="size-[18px]" />{!collapsed && <span>Settings</span>}
        </Link>
        <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition" title="Sign out">
          <LogOut className="size-[18px]" />{!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[oklch(0.97_0.01_95)]">
      {/* Desktop sidebar */}
      <aside className={`hidden md:block shrink-0 transition-all duration-300 ${collapsed ? "w-[72px]" : "w-64"}`}>
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-64 z-50 md:hidden animate-slide-in-right">{SidebarInner}</aside>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top navbar */}
        <header className="sticky top-0 z-30 h-16 px-4 md:px-6 flex items-center gap-3 border-b border-border/60 bg-background/70 backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setCollapsed((v) => !v)}>
            <Menu className="size-5" />
          </Button>

          <div className="hidden md:flex items-center flex-1 max-w-md relative">
            <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search invoices, vendors, GSTIN…" className="pl-9 h-9 bg-muted/50 border-transparent focus-visible:bg-background" />
          </div>

          <div className="flex-1 md:flex-none" />

          {availableClients.length > 0 && (
            <select
              value={activeClientId ?? ""}
              onChange={(e) => setActiveClientId(e.target.value || null)}
              className="hidden sm:block h-9 px-3 rounded-full border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              title="Active client"
            >
              {availableClients.length > 1 && <option value="">All clients</option>}
              {availableClients.map((c) => (
                <option key={c.id} value={c.id}>{c.business_name}</option>
              ))}
            </select>
          )}
          {availableClients.length === 0 && isCA && (
            <Link to="/ca/clients" className="hidden sm:inline-flex"><Button size="sm" variant="outline" className="rounded-full">Invite client</Button></Link>
          )}

          {activeClient && false /* keep var used */}

          {isCA && <TimerWidget />}

          <Link to="/assistant" className="hidden sm:inline-flex">
            <Button variant="outline" size="sm" className="gap-2 rounded-full">
              <Sparkles className="size-4 text-primary" /> Ask AI
            </Button>
          </Link>
          <Link to={uploadTo}>
            <Button size="sm" className="gap-2 rounded-full shadow-sm">
              <Plus className="size-4" /> <span className="hidden sm:inline">{isCA ? "Clients" : "Upload"}</span>
            </Button>
          </Link>


          <NotificationsBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-muted transition">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <ChevronDown className="size-4 text-muted-foreground hidden sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-xs text-muted-foreground">Signed in as</div>
                <div className="text-sm font-medium truncate">{email || "—"}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {role === "ca_staff" && userId && (
                <DropdownMenuItem asChild>
                  <Link to="/ca/staff/$userId" params={{ userId }}><UserCog className="size-4 mr-2" /> My profile</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild><Link to={settingsTo}><Settings className="size-4 mr-2" /> Settings</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={signOut}><LogOut className="size-4 mr-2" /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-auto"><Outlet /></main>
      </div>
    </div>
  );
}