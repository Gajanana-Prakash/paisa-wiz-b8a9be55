import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, Mail, Phone, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientProfile } from "@/lib/client-portal.functions";

export function ClientProfilePage() {
  const load = useServerFn(getClientProfile);
  const { data, isLoading } = useQuery({
    queryKey: ["client-profile"],
    queryFn: () => load({ data: undefined as any }),
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const c = data?.client;
  const firm = data?.firm;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">My profile</h1>
        <p className="text-muted-foreground mt-1">Your business details on file</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="size-5" />
            {c?.business_name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-base">
          {[
            { icon: Hash, label: "GSTIN", value: c?.gstin },
            { icon: Mail, label: "Email", value: c?.contact_email },
            { icon: Phone, label: "Phone", value: c?.contact_phone },
          ].map((row) =>
            row.value ? (
              <div key={row.label} className="flex gap-3">
                <row.icon className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">{row.label}</p>
                  <p className="font-medium">{row.value}</p>
                </div>
              </div>
            ) : null,
          )}
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground">Contact person</p>
            <p className="font-medium">{c?.contact_name ?? data?.profile?.full_name ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your CA firm</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-lg">{firm?.name}</p>
          {firm?.phone && <p className="text-muted-foreground mt-2">Phone: {firm.phone}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
