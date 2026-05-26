import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Briefcase, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/signup/")({ component: SignupChooser });

function SignupChooser() {
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:block relative" style={{ background: "var(--gradient-hero)" }}>
        <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-primary-foreground">
          <div className="size-9 rounded-lg bg-[var(--gradient-gold)] grid place-items-center text-primary font-bold">G</div>
          <span className="font-display text-lg font-semibold">GSTify</span>
        </Link>
        <div className="absolute bottom-12 left-12 right-12 text-primary-foreground">
          <h2 className="font-display text-3xl font-semibold">One platform. CAs and their clients.</h2>
          <p className="mt-3 text-primary-foreground/70">Pick how you'll use GSTify.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="font-display text-3xl font-semibold">Get started</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>

          <Link to="/signup/ca" className="mt-6 block group">
            <div className="p-5 rounded-2xl border border-border hover:border-primary/60 hover:shadow-md transition bg-card">
              <div className="flex items-start gap-4">
                <div className="size-11 rounded-xl bg-primary/10 grid place-items-center text-primary"><Briefcase className="size-5" /></div>
                <div className="flex-1">
                  <div className="font-display text-lg font-semibold flex items-center gap-2">I'm a CA / Accountant <ArrowRight className="size-4 opacity-0 group-hover:opacity-100 transition" /></div>
                  <div className="text-sm text-muted-foreground mt-1">Create a firm, invite your clients, manage every GST workflow in one place.</div>
                </div>
              </div>
            </div>
          </Link>

          <div className="mt-4 p-5 rounded-2xl border border-dashed border-border bg-muted/30">
            <div className="flex items-start gap-4">
              <div className="size-11 rounded-xl bg-muted grid place-items-center text-muted-foreground"><Building2 className="size-5" /></div>
              <div className="flex-1">
                <div className="font-display text-lg font-semibold">I'm a Business / Client</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Clients join by invite only. Ask your CA to send you an invite link — then open it to set your password.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
