import { Check, ClipboardCheck, ClipboardList, Clock, FileText, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useCurrentStaff, staffFullName } from "@/hooks/useCurrentStaff";
import { useStoreCleaning, useCleaningActions, klockslag } from "@/hooks/useStoreCleaning";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { svenskDatum } from "@/lib/swedishTime";
import type { MapTask } from "@/hooks/useStoreMap";
import { SelfPunchCard, SELF_PUNCH_ANCHOR, useSelfPunchStatus } from "@/components/staff/SelfPunchCard";

/** Alltid grönt — stapeln visar hur mycket som är klart. */
function tone(_pct: number) {
  return { text: "text-emerald-600", bar: "bg-emerald-500" };
}

/**
 * Två stora knappar högst upp i Översikt — dagens uppgifter och stämpla in —
 * med en bred stapel där varje uppgift är en stolpe som tänds när den är klar.
 */
export function OverviewQuickBar({
  tasks,
  storeId,
  day,
}: {
  tasks: MapTask[];
  storeId?: string | null;
  day?: string;
}) {
  const navigate = useNavigate();
  /** Mobilstämpling: rutan visas bara för den som har rätt, och heter efter status. */
  const { data: punch } = useSelfPunchStatus();
  const punchLabel = punch ? (punch.suggested_action === "in" ? "Stämpla in" : "Stämpla ut") : null;
  const punchSub = punch
    ? punch.last_type === "rast_start" ? "På rast" : punch.suggested_action === "in" ? "Inte instämplad" : "Instämplad"
    : "";
  const date = day || svenskDatum();
  const isToday = date === svenskDatum();

  /** Städning: bara för butiker. Signaturen sätts på servern från inloggat konto. */
  const { data: store } = useQuery({
    queryKey: ["overview-store-unit", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, name, unit_type").eq("id", storeId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const isButik = store?.unit_type === "butik";
  const { data: cleaning } = useStoreCleaning(isButik ? storeId : null, date);
  const { sign, undo } = useCleaningActions();
  const { data: me } = useCurrentStaff();
  const myName = staffFullName(me);
  const { data: authUserId } = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  const { data: isAdmin = false } = useQuery({
    queryKey: ["is-hr-admin"],
    queryFn: async () => !!(await (supabase as any).rpc("is_hr_admin")).data,
  });
  const canUndo = !!cleaning && (cleaning.signed_by_user === authUserId || isAdmin);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  /** Är dagsrapporten skriven för dagen? Då lyser knappen grön. */
  const { data: dailyDone = false } = useQuery({
    queryKey: ["overview-daily-report-done", storeId, date],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("id")
        .eq("store_id", storeId!)
        .eq("report_date", date)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  /** Är inventeringen färdigställd för dagen? Låst tillfälle = klar rapport. */
  const { data: countDone = false } = useQuery({
    queryKey: ["overview-stock-count-done", storeId, date],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_count_sessions")
        .select("id")
        .eq("store_id", storeId!)
        .eq("count_date", date)
        .in("status", ["inskickad", "locked"])
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  /** Grön ruta när rapporten är klar, annars vanlig ljus ruta. */
  const boxClass = (done: boolean) =>
    cn(
      "flex min-h-[64px] items-center gap-3 rounded-2xl border px-4 py-4 text-left shadow-sm transition sm:px-5 sm:py-5",
      done
        ? "border-emerald-500/50 bg-emerald-50 ring-1 ring-emerald-500/40 hover:bg-emerald-100 dark:bg-emerald-500/10"
        : "border-border bg-card ring-1 ring-primary/30 hover:bg-muted",
    );

  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;
  const t = tone(pct);

  /** Översikten är bara en översikt — knappen leder vidare till uppgiftssidan. */
  const openTasks = () => navigate("/uppgifter");

  /** Max 60 stolpar så stapeln håller sig läsbar även med många uppgifter. */
  const bars = total > 0 && total <= 60 ? tasks : [];

  return (
    <div className="space-y-3">
      {/* Personlig mobilstämpling överst för den som har rätt */}
      <SelfPunchCard />
      {/* Dagsrapport, inventeringsrapport och städning ligger allra högst upp i Översikt */}
      <div className={cn("grid grid-cols-1 gap-3", isButik ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <button type="button" onClick={() => navigate("/dagsrapport")} className={boxClass(dailyDone)}>
          {dailyDone ? (
            <Check className="h-7 w-7 shrink-0 text-emerald-600" />
          ) : (
            <FileText className="h-7 w-7 shrink-0 text-primary" />
          )}
          <span className="min-w-0">
            <span
              className={cn(
                "block font-heading text-lg font-semibold leading-tight",
                dailyDone && "text-emerald-700 dark:text-emerald-300",
              )}
            >
              Dagsrapport
            </span>
            <span
              className={cn(
                "block text-sm sm:text-xs",
                dailyDone ? "text-emerald-700/80 dark:text-emerald-300/80" : "text-muted-foreground",
              )}
            >
              {dailyDone ? "Klar för idag" : "Dagens siffror för butiken"}
            </span>
          </span>
        </button>
        <button type="button" onClick={() => navigate("/rakna")} className={boxClass(countDone)}>
          {countDone ? (
            <Check className="h-7 w-7 shrink-0 text-emerald-600" />
          ) : (
            <ClipboardCheck className="h-7 w-7 shrink-0 text-primary" />
          )}
          <span className="min-w-0">
            <span
              className={cn(
                "block font-heading text-lg font-semibold leading-tight",
                countDone && "text-emerald-700 dark:text-emerald-300",
              )}
            >
              Inventeringsrapport
            </span>
            <span
              className={cn(
                "block text-sm sm:text-xs",
                countDone ? "text-emerald-700/80 dark:text-emerald-300/80" : "text-muted-foreground",
              )}
            >
              {countDone ? "Klar för idag" : "Räkna av lagret"}
            </span>
          </span>
        </button>
        {isButik && (
          <button
            type="button"
            onClick={() => (cleaning || isToday ? setConfirmOpen(true) : undefined)}
            disabled={!cleaning && !isToday}
            className={cn(boxClass(!!cleaning), !cleaning && !isToday && "cursor-default opacity-70")}
          >
            {cleaning ? (
              <Check className="h-7 w-7 shrink-0 text-emerald-600" />
            ) : (
              <Sparkles className="h-7 w-7 shrink-0 text-primary" />
            )}
            <span className="min-w-0">
              <span
                className={cn(
                  "block font-heading text-lg font-semibold leading-tight",
                  cleaning && "text-emerald-700 dark:text-emerald-300",
                )}
              >
                {cleaning ? "Städning klar" : "Städning"}
              </span>
              <span
                className={cn(
                  "block text-sm sm:text-xs",
                  cleaning ? "text-emerald-700/80 dark:text-emerald-300/80" : "text-muted-foreground",
                )}
              >
                {cleaning
                  ? `${cleaning.staff_name} kl ${klockslag(cleaning.signed_at)}`
                  : isToday
                    ? "Signera att städningen är gjord"
                    : "Inte signerad"}
              </span>
            </span>
          </button>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{cleaning ? "Städning klar" : "Signera städning"}</AlertDialogTitle>
            <AlertDialogDescription>
              {cleaning
                ? `Signerad av ${cleaning.staff_name} kl ${klockslag(cleaning.signed_at)}.`
                : `Signera att städningen i ${store?.name ?? "butiken"} är gjord i dag? Du signerar som ${myName ?? "ditt konto"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cleaning ? "Stäng" : "Avbryt"}</AlertDialogCancel>
            {!cleaning && (
              <AlertDialogAction
                onClick={() =>
                  storeId &&
                  sign.mutate(storeId, {
                    onError: (e: any) => toast({ title: "Kunde inte signera", description: e.message, variant: "destructive" }),
                  })
                }
              >
                Signera
              </AlertDialogAction>
            )}
            {cleaning && isToday && canUndo && (
              <AlertDialogAction
                onClick={() =>
                  undo.mutate(cleaning.id, {
                    onError: (e: any) => toast({ title: "Kunde inte ångra", description: e.message, variant: "destructive" }),
                  })
                }
              >
                Ångra signering
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={openTasks}
          className="flex items-center gap-3 rounded-2xl border border-border bg-primary px-4 py-4 text-left text-primary-foreground sm:px-5 sm:py-5 shadow-sm transition hover:brightness-110"
        >
          <ClipboardList className="h-7 w-7 shrink-0" />
          <span className="min-w-0">
            <span className="block font-heading text-lg font-semibold leading-tight">Dagens uppgifter</span>
            <span className="block text-sm tabular-nums opacity-90 sm:text-xs">
              {total - done} kvar av {total}
            </span>
          </span>
        </button>
        {punchLabel && (
          <button
            type="button"
            onClick={() => document.getElementById(SELF_PUNCH_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-sm transition hover:bg-muted sm:px-5 sm:py-5"
          >
            <Clock className="h-7 w-7 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block font-heading text-lg font-semibold leading-tight">{punchLabel}</span>
              <span className="block text-sm text-muted-foreground sm:text-xs">{punchSub}</span>
            </span>
          </button>
        )}
      </div>


      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-end justify-between">
          <p className="text-sm text-muted-foreground sm:text-xs">Klart idag</p>
          <p className={cn("font-heading text-3xl font-semibold tabular-nums leading-none", t.text)}>{pct} %</p>
        </div>
        {bars.length > 0 ? (
          <div className="mt-2 flex h-10 items-end gap-[3px]">
            {bars.map((task) => (
              <div
                key={task.id}
                title={task.task}
                className={cn(
                  "flex-1 rounded-sm transition-all",
                  task.done ? cn(t.bar, "h-full") : "h-1/3 bg-muted",
                )}
              />
            ))}
          </div>
        ) : (
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        )}
        <p className="mt-1.5 text-sm tabular-nums sm:text-[11px] text-muted-foreground">
          {done} av {total} uppgifter avbockade
        </p>
      </div>
    </div>
  );
}
