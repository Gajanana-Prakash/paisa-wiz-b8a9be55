import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/lib/support.content";

export function CAWelcomeOnboarding() {
  const { firm, role, refresh } = useTenant();
  const navigate = useNavigate();
  const complete = useServerFn(completeCaOnboardingWizard);
  const schedule = useServerFn(scheduleOnboardingCall);

  const [step, setStep] = useState(1);
  const [firmName, setFirmName] = useState("");
  const [city, setCity] = useState("");
  const [band, setBand] = useState("");
  const [callAt, setCallAt] = useState("");
  const [scheduledIso, setScheduledIso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const show =
    role === "ca_owner" &&
    firm &&
    firm.ca_onboarding_wizard_done === false;

  useEffect(() => {
    if (firm?.name) setFirmName(firm.name);
  }, [firm?.id, firm?.name]);

  if (!show) return null;

  const finishWizard = async () => {
    setBusy(true);
    try {
      await complete({
        data: {
          firmName: firmName.trim() || undefined,
          firmCity: city || undefined,
          clientCountBand: band || undefined,
          scheduledCallAt: scheduledIso ?? undefined,
          skipCall: !scheduledIso,
        },
      });
      await refresh();
      navigate({ to: "/ca/dashboard" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Welcome to GSTify! Let&apos;s get your firm set up.</DialogTitle>
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
                Get Started
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Would you like a free setup call?</DialogTitle>
              <DialogDescription>30-minute walkthrough with our team — we&apos;ll configure GSTify for your firm.</DialogDescription>
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
                    setStep(3);
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
                onClick={() => setStep(3)}
              >
                No, I&apos;ll explore myself
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Watch this 3-minute intro first?</DialogTitle>
              <DialogDescription>GSTify in 3 minutes — how CA firms and clients work together.</DialogDescription>
            </DialogHeader>
            <div className="mt-2 aspect-video rounded-xl overflow-hidden bg-black">
              <iframe
                title="GSTify intro"
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${SUPPORT_INTRO_YOUTUBE_ID}?rel=0`}
                allowFullScreen
              />
            </div>
            <Button className="w-full mt-4" disabled={busy} onClick={finishWizard}>
              Done, show me the dashboard
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
