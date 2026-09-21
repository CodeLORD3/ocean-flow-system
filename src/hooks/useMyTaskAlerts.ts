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

function seenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(SEEN_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

function remember(id: string) {
  const all = [...seenIds(), id].slice(-100);
  window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(all));
}

export function useMyTaskAlerts() {
  const { data: staff } = useCurrentStaff();
  const staffId = staff?.id ?? null;
  const [alerts, setAlerts] = useState<TaskAlert[]>([]);

  const dismiss = useCallback((id: string) => {
    setAlerts((list) => list.filter((a) => a.id !== id));
  }, []);

  const dismissAll = useCallback(() => setAlerts([]), []);

  useEffect(() => {
    if (!staffId) return;

    const add = (row: { id: string; task: string | null; done: boolean | null; assigned_staff_id: string | null }) => {
      if (row.assigned_staff_id !== staffId || row.done) return;
      if (seenIds().has(row.id)) return;
      remember(row.id);
      setAlerts((list) => (list.some((a) => a.id === row.id) ? list : [...list, { id: row.id, task: row.task ?? "Ny uppgift", at: Date.now() }]));
      playTaskAlert();
    };

    const channel = supabase
      .channel("my-task-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checklist_items" }, (p) => add(p.new as never))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "checklist_items" }, (p) => {
        const before = p.old as { assigned_staff_id?: string | null } | null;
        /* Larma bara när ansvaret faktiskt flyttas till mig */
        if (before?.assigned_staff_id === staffId) return;
        add(p.new as never);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [staffId]);

  return { alerts, dismiss, dismissAll };
}
