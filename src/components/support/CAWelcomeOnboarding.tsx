import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenant } from "@/hooks/useTenant";
import { completeCaOnboardingWizard, scheduleOnboardingCall } from "@/lib/support.functions";
import {
  CLIENT_COUNT_BANDS,
  INDIAN_CITIES,
  SUPPORT_INTRO_YOUTUBE_ID,
  TAX_SOFTWARE_OPTIONS,
  taxSoftwareLabels,
} from "@/lib/support.content";
import { CheckCircle2, Upload } from "lucide-react";

export function CAWelcomeOnboarding() {
  const { firm, role, refresh } = useTenant();
  const navigate = useNavigate();
  const complete = useServerFn(completeCaOnboardingWizard);
  const schedule = useServerFn(scheduleOnboardingCall);

  const [step, setStep] = useState(1);
  const [firmName, setFirmName] = useState("");
  const [city, setCity] = useState("");
  const [band, setBand] = useState("");
  const [software, setSoftware] = useState<string[]>([]);
  const [callAt, setCallAt] = useState("");
  const [scheduledIso, setScheduledIso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const show =
    role === "ca_owner" &&
    firm &&
    (firm as any).ca_onboarding_wizard_done === false;

  useEffect(() => {
    if (firm?.name) setFirmName(firm.name);
  }, [firm?.id, firm?.name]);

  if (!show) return null;

  const toggleSoftware = (v: string) => {
    setSoftware((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const finishWizard = async (goImport: boolean) => {
    setBusy(true);
    try {
      await complete({
        data: {
          firmName: firmName.trim() || undefined,
          firmCity: city || undefined,
          clientCountBand: band || undefined,
          existingTaxSoftware: software,
          scheduledCallAt: scheduledIso ?? undefined,
          skipCall: !scheduledIso,
        },
      });
      await refresh();
      navigate({ to: goImport ? "/ca/settings/import-clients" : "/ca/dashboard" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Welcome to PracticeDesk! Let&apos;s get your firm set up.</DialogTitle>
              <DialogDescription>Tell us a bit about your practice — takes 30 seconds.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>Your firm name</Label>
                <Input value={firmName} onChange={(e) => setFirmName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Your city</Label>
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_CITIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Clients you manage</Label>
                <Select value={band} onValueChange={setBand}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_COUNT_BANDS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={!firmName.trim() || !city || !band || busy}
                onClick={() => setStep(2)}
              >
                Next
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Which tax filing software does your firm currently use?</DialogTitle>
              <DialogDescription>
                Select all that apply. PracticeDesk works alongside your existing tools — we don&apos;t replace them.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              {TAX_SOFTWARE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={software.includes(opt.value)}
                    onCheckedChange={() => toggleSoftware(opt.value)}
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                </label>
              ))}
              {software.length > 0 && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm text-primary mt-3 flex gap-2">
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                  <span>
                    Great — PracticeDesk works alongside <strong>{taxSoftwareLabels(software)}</strong>. We organize
                    your clients, team, and deadlines. You keep filing with {taxSoftwareLabels(software)} exactly as you do today.
                  </span>
                </div>
              )}
              <Button
                className="w-full mt-3"
                disabled={software.length === 0 || busy}
                onClick={() => setStep(3)}
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Import your existing clients in 2 minutes</DialogTitle>
              <DialogDescription>
                Already have a client list in CompuTax, Spectrum, or a spreadsheet? Bring them in now — invite links go out automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
                <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
                  <Upload className="size-5" />
                </div>
                <div className="text-sm">
                  <div className="font-semibold">Import from your tax software or CSV</div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Upload a CompuTax export, Spectrum file, or any CSV. We&apos;ll map columns, skip duplicates, and create invite links in one go.
                  </p>
                </div>
              </div>
              <Button className="w-full" disabled={busy} onClick={() => finishWizard(true)}>
                Import my clients now
              </Button>
              <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setStep(4)}>
                Skip for now
              </Button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Would you like a free setup call?</DialogTitle>
              <DialogDescription>30-minute walkthrough with our team — we&apos;ll configure PracticeDesk for your firm.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>Pick date &amp; time</Label>
                <Input
                  type="datetime-local"
                  className="mt-1"
                  value={callAt}
                  onChange={(e) => setCallAt(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={!callAt || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const iso = new Date(callAt).toISOString();
                    await schedule({ data: { scheduledAt: iso } });
                    setScheduledIso(iso);
                    setStep(5);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Yes, book a 30-min call
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => setStep(5)}
              >
                No, I&apos;ll explore myself
              </Button>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Watch this 3-minute intro first?</DialogTitle>
              <DialogDescription>PracticeDesk in 3 minutes — how CA firms and clients work together.</DialogDescription>
            </DialogHeader>
            <div className="mt-2 aspect-video rounded-xl overflow-hidden bg-black">
              <iframe
                title="PracticeDesk intro"
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${SUPPORT_INTRO_YOUTUBE_ID}?rel=0`}
                allowFullScreen
              />
            </div>
            <Button className="w-full mt-4" disabled={busy} onClick={() => finishWizard(false)}>
              Done, show me the dashboard
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
