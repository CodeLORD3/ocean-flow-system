import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStores } from "@/hooks/useStores";
import {
  ADMIN_PROFILE,
  GROSSIST_PROFILE,
  PortalProfile,
  currentPortalProfile,
  storePortalKey,
  canChatWith,
  isAllowedConversation,
} from "@/lib/portalProfiles";

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_portal_key: string;
  sender_portal_name: string | null;
  sender_staff_id: string | null;
  sender_name: string | null;
  body: string | null;
  image_url: string | null;
  is_important?: boolean;
  created_at: string;
};


export type ChatParticipant = {
  id: string;
  conversation_id: string;
  portal_key: string;
  portal_name: string | null;
};

export type ChatConversation = {
  id: string;
  title: string | null;
  created_at: string;
  last_message_at: string;
  participants: ChatParticipant[];
  lastMessage?: ChatMessage | null;
};

const CHAT_BUCKET = "logos";

/** Alla portaler som finns som chattprofiler: Admin, Grossist och varje butik. */
export function usePortalProfiles(): PortalProfile[] {
  const { data: stores = [] } = useStores(true);
  return [
    ADMIN_PROFILE,
    GROSSIST_PROFILE,
    ...stores.map((s) => ({
      key: storePortalKey(s.id),
      name: s.name,
      kind: "store" as const,
      storeId: s.id,
    })),
  ];
}

/** Portaler som den aktiva portalen får chatta med enligt behörighetsreglerna. */
export function useAllowedChatTargets(): PortalProfile[] {
  const profiles = usePortalProfiles();
  const portal = useCurrentPortal();
  if (!portal) return [];
  return profiles.filter((p) => canChatWith(portal, p));
}

/** Aktuell portal som chattidentitet. */
export function useCurrentPortal(): PortalProfile | null {
  const { site, activeStoreId, activeStoreName } = useSite();
  return currentPortalProfile(site, activeStoreId, activeStoreName);
}

export function useChatConversations(portalKey?: string | null) {
  const portal = useCurrentPortal();
  return useQuery({
    queryKey: ["chat-conversations", portalKey],
    queryFn: async () => {
      const { data: mine, error: mineErr } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("portal_key", portalKey!);
      if (mineErr) throw mineErr;
      const ids = (mine || []).map((r) => r.conversation_id);
      if (ids.length === 0) return [] as ChatConversation[];

      const [{ data: convs, error: cErr }, { data: parts, error: pErr }, { data: msgs, error: mErr }] =
        await Promise.all([
          supabase
            .from("chat_conversations")
            .select("*")
            .in("id", ids)
            .order("last_message_at", { ascending: false }),
          supabase.from("chat_participants").select("*").in("conversation_id", ids),
          supabase
            .from("chat_messages")
            .select("*")
            .in("conversation_id", ids)
            .order("created_at", { ascending: false }),
        ]);
      if (cErr) throw cErr;
      if (pErr) throw pErr;
      if (mErr) throw mErr;

      const lastByConv = new Map<string, ChatMessage>();
      (msgs || []).forEach((m: any) => {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m as ChatMessage);
      });

      const mapped = (convs || []).map((c: any) => ({
        ...c,
        participants: (parts || []).filter((p: any) => p.conversation_id === c.id) as ChatParticipant[],
        lastMessage: lastByConv.get(c.id) ?? null,
      })) as ChatConversation[];

      // Visa bara chattar som den egna portalen faktiskt får kommunicera i
      if (!portal) return mapped;
      return mapped.filter((c) =>
        isAllowedConversation(portal, c.participants.map((p) => p.portal_key))
      );
    },
    enabled: !!portalKey,
    refetchInterval: 8000,
  });
}

export function useChatMessages(conversationId?: string | null) {
  return useQuery({
    queryKey: ["chat-messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at");
      if (error) throw error;
      return (data || []) as ChatMessage[];
    },
    enabled: !!conversationId,
    refetchInterval: 5000,
  });
}

/** Pågående skapanden per deltagarnyckel – hindrar dubbletter vid samtidiga anrop. */
const inflightConversations = new Map<string, Promise<string>>();

async function existingConversationFor(keys: string[]) {
  const { data: existingParts, error } = await supabase
    .from("chat_participants")
    .select("conversation_id, portal_key");
  if (error) throw error;
  const byConv = new Map<string, string[]>();
  (existingParts || []).forEach((p: any) => {
    byConv.set(p.conversation_id, [...(byConv.get(p.conversation_id) || []), p.portal_key]);
  });
  const matches: string[] = [];
  for (const [convId, convKeys] of byConv) {
    const sorted = [...new Set(convKeys)].sort();
    if (sorted.length === keys.length && sorted.every((k, i) => k === keys[i])) matches.push(convId);
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // Flera chattar med samma deltagare: behåll den äldsta, städa bort tomma dubbletter
  const { data: convs } = await supabase
    .from("chat_conversations")
    .select("id, created_at")
    .in("id", matches)
    .order("created_at", { ascending: true });
  const keep = (convs?.[0]?.id as string) || matches[0];
  const drop = matches.filter((id) => id !== keep);
  if (drop.length) {
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", drop);
    if (!count) {
      await supabase.from("chat_participants").delete().in("conversation_id", drop);
      await supabase.from("chat_conversations").delete().in("id", drop);
    }
  }
  return keep;
}

async function findOrCreateConversation(participants: PortalProfile[], staffId: string | null, title?: string) {
  const keys = [...new Set(participants.map((p) => p.key))].sort();
  if (keys.length < 2) throw new Error("En chatt behöver minst två portaler.");

  const cacheKey = keys.join("::");
  const pending = inflightConversations.get(cacheKey);
  if (pending) return pending;

  const run = (async () => {
    const existing = await existingConversationFor(keys);
    if (existing) return existing;

    const { data: conv, error } = await supabase
      .from("chat_conversations")
      .insert({ title: title || null, created_by_staff_id: staffId })
      .select("id")
      .single();
    if (error) throw error;
    const { error: pErr } = await supabase.from("chat_participants").insert(
      participants.map((p) => ({ conversation_id: conv.id, portal_key: p.key, portal_name: p.name }))
    );
    if (pErr) throw pErr;
    // Slutkontroll: om ett parallellt anrop hann skapa en chatt, behåll den äldsta
    return (await existingConversationFor(keys)) || (conv.id as string);
  })();

  inflightConversations.set(cacheKey, run);
  try {
    return await run;
  } finally {
    inflightConversations.delete(cacheKey);
  }
}


/** Skapar (eller återanvänder) en chatt mellan de valda portalerna. */
export function useCreateConversation() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async ({ participants, title }: { participants: PortalProfile[]; title?: string }) => {
      const keys = [...new Set(participants.map((p) => p.key))].sort();
      if (keys.length < 2) throw new Error("En chatt behöver minst två portaler.");

      // Återanvänd befintlig chatt med exakt samma deltagare
      const { data: existingParts, error: exErr } = await supabase
        .from("chat_participants")
        .select("conversation_id, portal_key");
      if (exErr) throw exErr;
      const byConv = new Map<string, string[]>();
      (existingParts || []).forEach((p: any) => {
        byConv.set(p.conversation_id, [...(byConv.get(p.conversation_id) || []), p.portal_key]);
      });
      for (const [convId, convKeys] of byConv) {
        const sorted = [...new Set(convKeys)].sort();
        if (sorted.length === keys.length && sorted.every((k, i) => k === keys[i])) return convId;
      }

      const { data: conv, error } = await supabase
        .from("chat_conversations")
        .insert({ title: title || null, created_by_staff_id: staff?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;

      const { error: pErr } = await supabase.from("chat_participants").insert(
        participants.map((p) => ({ conversation_id: conv.id, portal_key: p.key, portal_name: p.name }))
      );
      if (pErr) throw pErr;
      return conv.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-conversations"] }),
  });
}

export function useSendChatMessage() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  const portal = useCurrentPortal();
  return useMutation({
    mutationFn: async ({
      conversationId,
      body,
      file,
      important,
    }: {
      conversationId: string;
      body?: string;
      file?: File | null;
      important?: boolean;
    }) => {
      if (!portal) throw new Error("Ingen aktiv portal.");
      let imageUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `chat/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(CHAT_BUCKET).upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        imageUrl = supabase.storage.from(CHAT_BUCKET).getPublicUrl(path).data.publicUrl;
      }
      if (!body?.trim() && !imageUrl) return;

      const { error } = await supabase.from("chat_messages").insert({
        conversation_id: conversationId,
        sender_portal_key: portal.key,
        sender_portal_name: portal.name,
        sender_staff_id: staff?.id ?? null,
        sender_name: staff ? `${staff.first_name} ${staff.last_name}` : null,
        body: body?.trim() || null,
        image_url: imageUrl,
        is_important: !!important,
      });
      if (error) throw error;

      const { error: uErr } = await supabase
        .from("chat_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
      if (uErr) throw uErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["chat-messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
  });
}

/** Namn på motparterna i en chatt, sett från den egna portalen. */
export function conversationTitle(conv: ChatConversation, myKey?: string | null) {
  if (conv.title) return conv.title;
  const others = conv.participants.filter((p) => p.portal_key !== myKey);
  return others.map((p) => p.portal_name || p.portal_key).join(", ") || "Chatt";
}

/** Antal olästa meddelanden per chatt, samt totalt, för den aktiva portalen. */
export function useChatUnread() {
  const portal = useCurrentPortal();
  const { data } = useQuery({
    queryKey: ["chat-unread", portal?.key],
    queryFn: async () => {
      const { data: mine, error: mineErr } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("portal_key", portal!.key);
      if (mineErr) throw mineErr;
      const ids = (mine || []).map((r: any) => r.conversation_id);
      if (ids.length === 0) return { total: 0, byConv: {} as Record<string, number> };

      const { data: allParts } = await supabase
        .from("chat_participants")
        .select("conversation_id, portal_key")
        .in("conversation_id", ids);
      const keysByConv = new Map<string, string[]>();
      (allParts || []).forEach((p: any) => {
        keysByConv.set(p.conversation_id, [...(keysByConv.get(p.conversation_id) || []), p.portal_key]);
      });
      const allowedIds = new Set(
        ids.filter((id: string) => isAllowedConversation(portal!, keysByConv.get(id) || []))
      );

      const [{ data: reads, error: rErr }, { data: msgs, error: mErr }] = await Promise.all([
        supabase.from("chat_reads").select("conversation_id, last_read_at").eq("portal_key", portal!.key),
        supabase
          .from("chat_messages")
          .select("id, conversation_id, sender_portal_key, created_at")
          .in("conversation_id", ids),
      ]);
      if (rErr) throw rErr;
      if (mErr) throw mErr;

      const readAt = new Map<string, string>();
      (reads || []).forEach((r: any) => readAt.set(r.conversation_id, r.last_read_at));

      const byConv: Record<string, number> = {};
      (msgs || []).forEach((m: any) => {
        if (!allowedIds.has(m.conversation_id)) return;
        if (m.sender_portal_key === portal!.key) return;
        const last = readAt.get(m.conversation_id);
        if (last && new Date(m.created_at) <= new Date(last)) return;
        byConv[m.conversation_id] = (byConv[m.conversation_id] || 0) + 1;
      });
      const total = Object.values(byConv).reduce((a, b) => a + b, 0);
      return { total, byConv };
    },
    enabled: !!portal?.key,
    refetchInterval: 8000,
  });
  return data ?? { total: 0, byConv: {} as Record<string, number> };
}

/** Markerar en chatt som läst för den aktiva portalen. */
export function useMarkConversationRead() {
  const qc = useQueryClient();
  const portal = useCurrentPortal();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!portal || !conversationId) return;
      const { error } = await supabase
        .from("chat_reads")
        .upsert(
          { conversation_id: conversationId, portal_key: portal.key, last_read_at: new Date().toISOString() },
          { onConflict: "conversation_id,portal_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-unread"] }),
  });
}

/** Admin: skickar ett specialmeddelande (viktigt) till alla butiker. */
export function useBroadcastImportant() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  const portal = useCurrentPortal();
  const profiles = usePortalProfiles();
  return useMutation({
    mutationFn: async ({ body, storeKeys }: { body: string; storeKeys?: string[] }) => {
      if (!portal) throw new Error("Ingen aktiv portal.");
      if (!body.trim()) throw new Error("Meddelandet är tomt.");
      const targets = profiles.filter(
        (p) => p.kind === "store" && (!storeKeys?.length || storeKeys.includes(p.key))
      );
      if (targets.length === 0) throw new Error("Inga butiker att skicka till.");

      for (const target of targets) {
        const convId = await findOrCreateConversation([portal, target], staff?.id ?? null);
        const { error } = await supabase.from("chat_messages").insert({
          conversation_id: convId,
          sender_portal_key: portal.key,
          sender_portal_name: portal.name,
          sender_staff_id: staff?.id ?? null,
          sender_name: staff ? `${staff.first_name} ${staff.last_name}` : null,
          body: body.trim(),
          is_important: true,
        });
        if (error) throw error;
        await supabase
          .from("chat_conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", convId);
      }
      return targets.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      qc.invalidateQueries({ queryKey: ["chat-messages"] });
      qc.invalidateQueries({ queryKey: ["chat-unread"] });
    },
  });
}
