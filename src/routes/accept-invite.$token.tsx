import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvite, getInvitePublic } from "@/lib/tenant.functions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/accept-invite/$token")({ component: AcceptInvitePage });

function AcceptInvitePage() {
  const { token } = useParams({ from: "/accept-invite/$token" });
  const navigate = useNavigate();
  const fetchInvite = useServerFn(getInvitePublic);
  const runAccept = useServerFn(acceptInvite);
  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchInvite({ data: { token } });
        setInvite(r);
        if ((r as any)?.email) setEmail((r as any).email);
      } finally { setLoading(false); }
    })();
  }, [fetchInvite, token]);

  const tryAccept = async () => {
    try {
      await runAccept({ data: { token } });
      toast.success("Welcome! You're connected to your CA.");
      navigate({ to: "/dashboard" });
    } catch (e: any) { toast.error(e.message || "Could not accept invite"); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name, invite_token: token }, emailRedirectTo: window.location.origin + `/accept-invite/${token}` },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Confirm your email, then come back to this link");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await tryAccept();
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="size-6 animate-spin" /></div>;

  if (!invite?.ok) {
    const reason = invite?.reason || "not_found";
    const msg = reason === "expired" ? "This invite has expired." : reason === "accepted" ? "This invite has already been used." : "Invite not found.";
    return (
      <div className="min-h-screen grid place-items-center p-8 text-center">
        <div>
          <h1 className="font-display text-2xl font-semibold">{msg}</h1>
          <p className="text-muted-foreground mt-2">Ask your CA to send a new invite link.</p>
          <Link to="/" className="text-primary mt-4 inline-block">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:block relative" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute bottom-12 left-12 right-12 text-primary-foreground">
          <h2 className="font-display text-3xl font-semibold">{invite.firmName} invited you</h2>
          <p className="mt-3 text-primary-foreground/70">Set up access for <span className="font-medium">{invite.businessName}</span> and start uploading invoices.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl font-semibold">{mode === "signup" ? "Create your client account" : "Sign in to accept"}</h1>
          <p className="text-sm text-muted-foreground mt-1">For <strong>{invite.businessName}</strong></p>
          <form onSubmit={submit} className="space-y-4 mt-6">
            {mode === "signup" && (<div><Label>Full name</Label><Input required value={name} onChange={(e)=>setName(e.target.value)} className="mt-1.5" /></div>)}
            <div><Label>Email</Label><Input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} className="mt-1.5" /></div>
            <div><Label>Password</Label><Input type="password" minLength={6} required value={password} onChange={(e)=>setPassword(e.target.value)} className="mt-1.5" /></div>
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Working..." : mode === "signup" ? "Create account & accept" : "Sign in & accept"}</Button>
          </form>
          <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="mt-4 text-sm text-primary hover:underline">
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}