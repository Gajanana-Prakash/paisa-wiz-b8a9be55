import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getClientPendingTasks } from "@/lib/client-portal.functions";

export function ClientPendingTasksPage() {
  const load = useServerFn(getClientPendingTasks);
  const { data, isLoading } = useQuery({
    queryKey: ["client-pending-tasks"],
    queryFn: () => load({ data: undefined as any }),
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const tasks = data?.tasks ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Pending tasks</h1>
        <p className="text-muted-foreground mt-1">What your CA is waiting for from you</p>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-lg text-muted-foreground">
            Nothing pending — you&apos;re all caught up.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {tasks.map((t) => (
            <li key={`${t.kind}-${t.id}`}>
              <Card className={t.overdue ? "border-rose-300" : ""}>
                <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                  <div className="flex gap-3">
                    {t.overdue && <AlertCircle className="size-6 text-rose-600 shrink-0 mt-0.5" />}
                    <div>
                      <p className="font-semibold text-lg">{t.title}</p>
                      <p className="text-muted-foreground mt-1">{t.detail}</p>
                      {t.dueDate && (
                        <p className={`text-sm mt-2 ${t.overdue ? "text-rose-600 font-medium" : ""}`}>
                          Due {new Date(t.dueDate).toLocaleDateString("en-IN")}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button asChild size="lg" className="shrink-0 h-12">
                    <Link to={t.link}>Take action</Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
