import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SupplierDocument } from "@/lib/supplierDocumentIntake";

export interface MailSender {
  id: string;
  pattern: string;
  kind: string;
  supplier_id: string | null;
  legal_entity_id: string | null;
  active: boolean;
  note: string | null;
}

export interface MailMessage {
  id: string;
  message_id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  sent_at: string | null;
  received_at: string;
  status: string;
  attachment_count: number;
  supplier_id: string | null;
  error: string | null;
}

export interface MailRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  folder: string | null;
  fetched: number;
  stored: number;
  skipped: number;
  unread_without_attachment: number;
  error: string | null;
}

export function useSupplierDocuments() {
  return useQuery({
    queryKey: ["supplier-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_documents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as SupplierDocument[];
    },
  });
}

export function useMailSenders() {
  return useQuery({
    queryKey: ["mail-intake-senders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mail_intake_senders")
        .select("*")
        .order("pattern");
      if (error) throw error;
      return (data ?? []) as unknown as MailSender[];
    },
  });
}

export function useMailMessages() {
  return useQuery({
    queryKey: ["mail-intake-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mail_intake_messages")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as MailMessage[];
    },
  });
}

export function useMailRuns() {
  return useQuery({
    queryKey: ["mail-intake-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mail_intake_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as MailRun[];
    },
    refetchInterval: 60_000,
  });
}

export function useMailIntakeActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["supplier-documents"] });
    qc.invalidateQueries({ queryKey: ["mail-intake-messages"] });
    qc.invalidateQueries({ queryKey: ["mail-intake-runs"] });
    qc.invalidateQueries({ queryKey: ["mail-intake-senders"] });
  };

  const runIntake = useMutation({
    mutationFn: async (opts: { folder?: string; move?: boolean } = {}) => {
      const { data, error } = await supabase.functions.invoke("mail-intake", { body: opts });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { fetched: number; stored: number; skipped: number; unread_without_attachment: number };
    },
    onSuccess: invalidate,
  });

  const saveSender = useMutation({
    mutationFn: async (sender: Partial<MailSender> & { pattern: string }) => {
      const payload = {
        pattern: sender.pattern.trim().toLowerCase().replace(/^@/, ""),
        kind: sender.pattern.includes("@") ? "email" : "domain",
        supplier_id: sender.supplier_id ?? null,
        legal_entity_id: sender.legal_entity_id ?? null,
        active: sender.active ?? true,
        note: sender.note ?? null,
      };
      const { error } = sender.id
        ? await supabase.from("mail_intake_senders").update(payload).eq("id", sender.id)
        : await supabase.from("mail_intake_senders").insert(payload);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeSender = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mail_intake_senders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const ignoreMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mail_intake_messages").update({ status: "ignorerad" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { runIntake, saveSender, removeSender, ignoreMessage, invalidate };
}
