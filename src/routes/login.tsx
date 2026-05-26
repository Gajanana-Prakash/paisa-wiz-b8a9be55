import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/dashboard" });
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) toast.error(r.error.message);
    else if (!r.redirected) navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:block relative" style={{ background: "var(--gradient-hero)" }}>
        <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-primary-foreground">
          <div className="size-9 rounded-lg bg-[var(--gradient-gold)] grid place-items-center text-primary font-bold">G</div>
          <span className="font-display text-lg font-semibold">GSTify</span>
        </Link>
        <div className="absolute bottom-12 left-12 right-12 text-primary-foreground">
          <h2 className="font-display text-3xl font-semibold">Welcome back.</h2>
          <p className="mt-3 text-primary-foreground/70">Pick up right where you left off.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-semibold">Sign in</h1>
          <p className="mt-2 text-muted-foreground text-sm">No account? <Link to="/signup" className="text-primary font-medium hover:underline">Sign up</Link></p>
          <Button onClick={google} variant="outline" className="w-full mt-6">Continue with Google</Button>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border"/>OR<div className="h-px flex-1 bg-border"/></div>
          <form onSubmit={submit} className="space-y-4">
            <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" /></div>
            <div><Label htmlFor="password">Password</Label><Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" /></div>
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Signing in..." : "Sign in"}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}