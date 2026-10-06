import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

export type FlowOwner = "tim" | "baldvin" | "joakim";
export const FLOW_OWNERS: { key: FlowOwner; label: string }[] = [
  { key: "tim", label: "Tim" },
  { key: "baldvin", label: "Baldvin" },
  { key: "joakim", label: "Joakim" },
];
export const FLOW_PHASES = [
  { key: "kopplingar", label: "Kopplingar" },
  { key: "idag", label: "I dag" },
  { key: "vecka", label: "Denna vecka" },
  { key: "senare", label: "Senare" },
] as const;
export const PROMPT_STATUS: Record<string, string> = {
  forslag: "Förslag", godkand: "Godkänd", kors: "Körs", klar: "Klar", avvisad: "Avvisad", fel: "Fel",
};

export interface FlowPrompt {
  id: string; title: string; target: string; risk: string; why: string | null; prompt: string;
  created_by: string; created_at: string; status: string; approved_by: string | null;
  approved_at: string | null; result: string | null; ran_at: string | null;
}
export interface FlowTask {
  id: string; title: string; owner: FlowOwner; phase: string; sort_order: number; status: string;
  why: string | null; steps: string | null; prompt: string | null; done_at: string | null; done_by: string | null;
}
export interface FlowMessage { id: string; author: string; author_name: string | null; body: string; created_at: string }
export interface FlowLog { id: string; agent: string; created_at: string; text: string }

const db = supabase as any;

export function useIsFlowOwner() {
  const { user } = useStaffAuth();
  return useQuery({
    queryKey: ["flow-owner", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("is_flow_owner");
      if (error) return false;
      return !!data;
    },
  });
}

export function useFlowPrompts() {
  return useQuery({
    queryKey: ["flow-prompts"],
    queryFn: async () => {
      const { data, error } = await db.from("flow_prompts").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as FlowPrompt[];
    },
  });
}

export function useFlowTasks() {
  return useQuery({
    queryKey: ["flow-tasks"],
    queryFn: async () => {
      const { data, error } = await db.from("flow_tasks").select("*").order("sort_order").order("created_at");
      if (error) throw error;
      return (data ?? []) as FlowTask[];
    },
  });
}

export function useFlowLog(limit = 200) {
  return useQuery({
    queryKey: ["flow-log", limit],
    queryFn: async () => {
      const { data, error } = await db.from("flow_agent_log").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as FlowLog[];
    },
  });
}

export function useFlowMessages() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("flow-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "flow_messages" }, () =>
        qc.invalidateQueries({ queryKey: ["flow-messages"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  return useQuery({
    queryKey: ["flow-messages"],
    queryFn: async () => {
      const { data, error } = await db.from("flow_messages").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return ((data ?? []) as FlowMessage[]).reverse();
    },
  });
}

export function useFlowMutations() {
  const qc = useQueryClient();
  const { user, staff } = useStaffAuth();
  const inv = (k: string) => qc.invalidateQueries({ queryKey: [k] });
  return {
    createPrompt: useMutation({
      mutationFn: async (p: { title: string; target: string; risk: string; why: string; prompt: string }) => {
        const { error } = await db.from("flow_prompts").insert({ ...p, created_by: user?.id });
        if (error) throw error;
      },
      onSuccess: () => inv("flow-prompts"),
    }),
    decidePrompt: useMutation({
      mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
        const { error } = await db.from("flow_prompts")
          .update({ status: approve ? "godkand" : "avvisad", approved_by: user?.id, approved_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      },
      onSuccess: () => inv("flow-prompts"),
    }),
    saveTask: useMutation({
      mutationFn: async (t: Partial<FlowTask> & { title: string; owner: FlowOwner }) => {
        const { error } = t.id
          ? await db.from("flow_tasks").update(t).eq("id", t.id)
          : await db.from("flow_tasks").insert(t);
        if (error) throw error;
      },
      onSuccess: () => inv("flow-tasks"),
    }),
    setTaskStatus: useMutation({
      mutationFn: async ({ id, status }: { id: string; status: string }) => {
        const { error } = await db.from("flow_tasks").update({ status }).eq("id", id);
        if (error) throw error;
      },
      onSuccess: () => inv("flow-tasks"),
    }),
    sendMessage: useMutation({
      mutationFn: async (body: string) => {
        const name = staff ? `${staff.first_name} ${staff.last_name}` : null;
        const { error } = await db.from("flow_messages").insert({ body, author: user?.id, author_name: name });
        if (error) throw error;
      },
      onSuccess: () => inv("flow-messages"),
    }),
  };
}
