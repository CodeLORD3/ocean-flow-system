import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MeetingProtocol {
  id: string;
  store_id: string;
  meeting_date: string;
  title: string;
  attendees: string | null;
  notes: string | null;
  created_at: string;
  meeting_protocol_items?: MeetingProtocolItem[];
}

export interface MeetingProtocolItem {
  id: string;
  protocol_id: string;
  content: string;
  sort_order: number;
  completed: boolean;
  assigned_to: string | null;
  calendar_event_id: string | null;
  staff?: { id: string; first_name: string; last_name: string } | null;
}

export function useMeetingProtocols(storeId: string | null) {
  return useQuery({
    queryKey: ["meeting_protocols", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_protocols")
        .select("*, meeting_protocol_items(*, staff:assigned_to(id, first_name, last_name))")
        .eq("store_id", storeId!)
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return data as MeetingProtocol[];
    },
  });
}

export function useCreateMeetingProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { store_id: string; title: string; meeting_date: string; attendees?: string; notes?: string }) => {
      const { data, error } = await supabase.from("meeting_protocols").insert(p).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting_protocols"] }),
  });
}

export function useUpdateMeetingProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; meeting_date?: string; attendees?: string; notes?: string }) => {
      const { data, error } = await supabase.from("meeting_protocols").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting_protocols"] }),
  });
}

export function useDeleteMeetingProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meeting_protocols").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting_protocols"] }),
  });
}

export function useAddProtocolItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { protocol_id: string; content: string; sort_order?: number }) => {
      const { data, error } = await supabase.from("meeting_protocol_items").insert(p).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting_protocols"] }),
  });
}

export function useUpdateProtocolItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; content?: string; completed?: boolean; sort_order?: number; assigned_to?: string | null }) => {
      const { data, error } = await supabase.from("meeting_protocol_items").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting_protocols"] }),
  });
}

export function useDeleteProtocolItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meeting_protocol_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting_protocols"] }),
  });
}
