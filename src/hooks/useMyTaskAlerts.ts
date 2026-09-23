import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { playTaskAlert } from "@/lib/notificationSound";

/**
 * Nya uppgifter till mig: lyssnar direkt på checklist_items och larmar när en
 * uppgift blir tilldelad det inloggade kontot. Inget nytt lagras — vi läser
 * bara den uppgift som ändrades och visar den högst upp på sidan med ljud.
 */
export type TaskAlert = {
  id: string;
  task: string;
  at: number;
};

const SEEN_KEY = "task-alerts-seen";
const DISMISSED_KEY = "task-alerts-dismissed";
const soundedThisPage = new Set<string>();

function readIds(store: Storage | undefined, key: string): Set<string> {
  if (!store) return new Set();
  try {
    return new Set(JSON.parse(store.getItem(key) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

function seenIds(): Set<string> {
  return readIds(typeof window === "undefined" ? undefined : window.sessionStorage, SEEN_KEY);
}

function remember(id: string) {
  const all = [...seenIds(), id].slice(-100);
  window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(all));
}

function dismissedIds(): Set<string> {
  return readIds(typeof window === "undefined" ? undefined : window.localStorage, DISMISSED_KEY);
}

function rememberDismissed(ids: string[]) {
  const all = [...dismissedIds(), ...ids].slice(-200);
  window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(all));
}

export function useMyTaskAlerts() {
  const { data: staff } = useCurrentStaff();
  const staffId = staff?.id ?? null;
  const [alerts, setAlerts] = useState<TaskAlert[]>([]);

  const dismiss = useCallback((id: string) => {
    rememberDismissed([id]);
    setAlerts((list) => list.filter((a) => a.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setAlerts((list) => {
      rememberDismissed(list.map((a) => a.id));
      return [];
    });
  }, []);

  useEffect(() => {
    if (!staffId) return;
    let alive = true;

    const add = (
      row: { id: string; task: string | null; done: boolean | null; assigned_staff_id: string | null },
      sound = true,
    ) => {
      if (row.assigned_staff_id !== staffId || row.done) return;
      if (dismissedIds().has(row.id)) return;
      remember(row.id);
      setAlerts((list) =>
        list.some((a) => a.id === row.id)
          ? list
          : [...list, { id: row.id, task: row.task ?? "Ny uppgift", at: Date.now() }],
      );
      if (sound && !soundedThisPage.has(row.id)) {
        soundedThisPage.add(row.id);
        playTaskAlert();
      }
    };

    /* Öppna uppgifter som redan ligger på mig ska lysa direkt vid inloggning */
    void (async () => {
      const { data } = await supabase
        .from("checklist_items")
        .select("id, task, done, assigned_staff_id")
        .eq("assigned_staff_id", staffId)
        .eq("done", false)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!alive || !data) return;
      data.forEach((row) => add(row as never, true));
    })();

    // Egen kanal per montering: ett återanvänt namn kraschar när kanalen
    // redan är igång (callbacks kan inte läggas till efter subscribe).
    const channel = supabase
      .channel(`my-task-alerts-${staffId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checklist_items" }, (p) => add(p.new as never))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "checklist_items" }, (p) => {
        const before = p.old as { assigned_staff_id?: string | null } | null;
        /* Larma bara när ansvaret faktiskt flyttas till mig */
        if (before?.assigned_staff_id === staffId) return;
        add(p.new as never);
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [staffId]);

  return { alerts, dismiss, dismissAll };
}

