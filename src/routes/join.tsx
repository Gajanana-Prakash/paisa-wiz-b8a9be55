import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { lookupReferralCodePublic } from "@/lib/referrals.functions";

const REF_KEY = "gstify_referral_code";

export const Route = createFileRoute("/join")({
  validateSearch: (s: Record<string, unknown>) => ({
    ref: typeof s.ref === "string" ? s.ref : "",
  }),
  component: JoinPage,
});

function JoinPage() {
  const { ref } = Route.useSearch();
  const navigate = useNavigate();
  const lookup = useServerFn(lookupReferralCodePublic);
  const [info, setInfo] = useState<{ referrerName: string; trialDays: number } | null>(null);
  const [loading, setLoading] = useState(!!ref);

  useEffect(() => {
    if (!ref) return;
    if (typeof window !== "undefined") {
      localStorage.setItem(REF_KEY, ref.trim().toUpperCase());
    }
    lookup({ data: { code: ref } })
      .then((r) => {
        if (r.ok) setInfo({ referrerName: r.referrerName, trialDays: r.trialDays });
      })
      .finally(() => setLoading(false));
  }, [ref, lookup]);

  const continueSignup = () => {
    navigate({ to: "/signup/ca" });
  };

  return (
    <div className="min-h-screen grid place-items-center p-8 bg-gradient-to-b from-background to-muted/40">
      <div className="max-w-md w-full text-center space-y-6">
        <Link to="/" className="inline-flex items-center gap-2 font-display text-xl font-semibold">
          <div className="size-9 rounded-lg bg-[var(--gradient-gold)] grid place-items-center text-primary font-bold">P</div>
          PracticeDesk
        </Link>
        {loading ? (
          <Loader2 className="size-8 animate-spin mx-auto text-primary" />
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold">Join PracticeDesk</h1>
            {info ? (
              <p className="text-muted-foreground text-lg">
                <span className="font-medium text-foreground">{info.referrerName}</span> invited you.
                Start with a {info.trialDays}-day free trial.
              </p>
            ) : (
              <p className="text-muted-foreground">Create your CA firm workspace on PracticeDesk.</p>
            )}
            <Button size="lg" className="w-full h-12 text-base" onClick={continueSignup}>
              Create your CA firm
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function getStoredReferralCode() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(REF_KEY) ?? "";
}
