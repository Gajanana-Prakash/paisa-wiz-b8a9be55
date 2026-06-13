import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  confirmAgreementSignature,
  getAgreementForSigning,
  requestSigningOtp,
} from "@/lib/agreements.functions";
import { AgreementDocumentView } from "@/components/agreements/AgreementContentEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { CheckCircle2, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/sign/$token")({ component: SignAgreementPage });

function SignAgreementPage() {
  const { token } = Route.useParams();
  const fetchAgreement = useServerFn(getAgreementForSigning);
  const requestOtp = useServerFn(requestSigningOtp);
  const confirmSign = useServerFn(confirmAgreementSignature);

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof fetchAgreement>> | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [designation, setDesignation] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchAgreement({ data: { token } }).then((r) => {
      setPayload(r);
      if (r.ok && r.agreement?.signerName) setSignerName(r.agreement.signerName);
      setLoading(false);
    });
  }, [fetchAgreement, token]);

  const handleRequestOtp = async () => {
    if (!agreed) { toast.error("Please confirm you have read the agreement"); return; }
    if (!signerName.trim()) { toast.error("Enter your full name"); return; }
    setBusy(true);
    try {
      const r = await requestOtp({ data: { token } });
      setOtpSent(true);
      setDemoOtp(r.demoOtp ?? null);
      toast.success(r.phoneMasked ? `OTP sent to ${r.phoneMasked}` : "OTP generated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not send OTP");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (otp.length !== 6) { toast.error("Enter 6-digit OTP"); return; }
    setBusy(true);
    try {
      const r = await confirmSign({
        data: {
          token,
          otp,
          signerName: signerName.trim(),
          designation: designation.trim() || undefined,
          signingDevice: navigator.userAgent.slice(0, 500),
        },
      });
      setDone(true);
      setSignedUrl(r.signedPdfUrl ?? null);
      toast.success("Agreement signed successfully");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Signing failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!payload?.ok) {
    const msgs: Record<string, string> = {
      not_found: "This signing link is invalid.",
      expired: "This signing link has expired.",
      already_signed: "This agreement has already been signed.",
      invalid_status: "This agreement is no longer available for signing.",
    };
    return (
      <div className="min-h-screen grid place-items-center p-8 text-center bg-slate-50">
        <div className="max-w-md">
          <h1 className="font-display text-2xl font-semibold">{msgs[payload?.reason ?? "not_found"]}</h1>
          <p className="text-muted-foreground mt-2">Contact your CA firm for assistance.</p>
        </div>
      </div>
    );
  }

  const { agreement, firm } = payload;

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center p-8 bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 className="size-16 text-emerald-600 mx-auto" />
          <h1 className="font-display text-2xl font-semibold">Agreement signed successfully</h1>
          <p className="text-muted-foreground">Thank you, {signerName}. A copy has been recorded.</p>
          {signedUrl && (
            <Button onClick={() => window.open(signedUrl, "_blank")} className="gap-1">
              Download signed copy
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          {firm?.logo_url ? (
            <img src={firm.logo_url} alt="" className="h-10 w-auto object-contain" />
          ) : (
            <div className="size-10 rounded-lg bg-primary/10 grid place-items-center font-bold text-primary">
              {(firm?.name ?? "CA").slice(0, 1)}
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Agreement for Signature</div>
            <div className="font-semibold">{firm?.name}</div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-display text-2xl font-semibold mb-8">{agreement.title}</h1>

        <div className="rounded-2xl border bg-white p-8 md:p-10 shadow-sm mb-10">
          <AgreementDocumentView html={agreement.contentHtml} />
        </div>

        <div className="rounded-2xl border-2 border-emerald-200 bg-white p-6 md:p-8 shadow-sm space-y-5">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold">
            <Shield className="size-5" /> Digital Signature
          </div>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
            <span>I have read and agree to the above terms and conditions.</span>
          </label>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Full name</Label>
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Designation (optional)</Label>
              <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Director, Proprietor…" className="mt-1" />
            </div>
          </div>

          {!otpSent ? (
            <Button
              onClick={handleRequestOtp}
              disabled={busy || !agreed}
              className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700"
            >
              Sign with OTP
            </Button>
          ) : (
            <div className="space-y-4">
              {demoOtp && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Demo mode: your OTP is <strong>{demoOtp}</strong>. In production this is sent via SMS.
                </p>
              )}
              <div>
                <Label>Enter 6-digit OTP</Label>
                <InputOTP maxLength={6} value={otp} onChange={setOtp} className="mt-2">
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                onClick={handleConfirm}
                disabled={busy || otp.length !== 6}
                className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700"
              >
                Confirm &amp; Sign
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground border-t pt-4">
            By signing with OTP, you confirm your identity and agreement to these terms. This constitutes a legally binding electronic signature under the Information Technology Act, 2000.
          </p>
        </div>
      </main>
    </div>
  );
}
