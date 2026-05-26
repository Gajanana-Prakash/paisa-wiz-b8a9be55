import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/signup/ca")({ component: SignupCA });

function SignupCA() {
  const navigate = useNavigate();
  const [firmName, setFirmName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/dashboard",
        data: { full_name: name, firm_name: firmName, phone, role_intent: "ca_owner" },
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    // If no session (email confirm on, or account already exists), try password sign-in.
    let session = data.session;
    if (!session) {
      const { data: s, error: sErr } = await supabase.auth.signInWithPassword({ email, password });
      if (sErr) {
        setLoading(false);
        return toast.error(sErr.message);
      }
      session = s.session;
    }
    setLoading(false);
    toast.success("Firm created — welcome");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:block relative" style={{ background: "var(--gradient-hero)" }}>
        <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-primary-foreground">
          <div className="size-9 rounded-lg bg-[var(--gradient-gold)] grid place-items-center text-primary font-bold">G</div>
          <span className="font-display text-lg font-semibold">GSTify</span>
        </Link>
        <div className="absolute bottom-12 left-12 right-12 text-primary-foreground">
          <h2 className="font-display text-3xl font-semibold">The OS between CA firms and their clients.</h2>
          <p className="mt-3 text-primary-foreground/70">Invite every client. Centralize every invoice. File faster.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-semibold">Create your CA firm</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Not a CA? <Link to="/signup" className="text-primary font-medium hover:underline">Back to options</Link>
          </p>
          <form onSubmit={submit} className="space-y-4 mt-6">
            <div><Label>Firm name</Label><Input required value={firmName} onChange={(e)=>setFirmName(e.target.value)} className="mt-1.5" placeholder="e.g. Sharma & Co." /></div>
            <div><Label>Your full name</Label><Input required value={name} onChange={(e)=>setName(e.target.value)} className="mt-1.5" /></div>
            <div><Label>Work email</Label><Input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} className="mt-1.5" /></div>
            <div><Label>Phone (optional)</Label><Input value={phone} onChange={(e)=>setPhone(e.target.value)} className="mt-1.5" /></div>
            <div><Label>Password</Label><Input type="password" minLength={6} required value={password} onChange={(e)=>setPassword(e.target.value)} className="mt-1.5" /></div>
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Creating..." : "Create CA firm"}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}