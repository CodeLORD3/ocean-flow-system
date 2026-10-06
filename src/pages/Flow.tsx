import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  FLOW_PHASES, PROMPT_STATUS, ROLE_LABEL, type FlowMember,
  useFlowCandidates, useFlowLog, useFlowMembers, useFlowMessages, useFlowMutations,
  useFlowPrompts, useFlowTasks, useIsFlowMember, useIsFlowOwner,
} from "@/hooks/useFlow";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" }) : "";

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" =>
  s === "fel" || s === "avvisad" ? "destructive" : s === "klar" ? "default" : s === "forslag" ? "outline" : "secondary";

function errText(e: unknown) {
  return e instanceof Error ? e.message : String((e as any)?.message ?? e);
}

function useMemberMap() {
  const { data: members = [] } = useFlowMembers();
  return useMemo(() => {
    const m = new Map<string, FlowMember>();
    members.forEach((x) => m.set(x.user_id, x));
    return { members, byId: m };
  }, [members]);
}

function Who({ id, map }: { id: string | null; map: Map<string, FlowMember> }) {
  if (!id) return null;
  const m = map.get(id);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="font-medium">{m?.full_name ?? "Tidigare medlem"}</span>
      {m && <Badge variant="outline" className="text-[10px]">{ROLE_LABEL[m.role]}</Badge>}
    </span>
  );
}

function Overview() {
  const { data: tasks = [] } = useFlowTasks();
  const { data: log = [] } = useFlowLog(5);
  const { members, byId } = useMemberMap();
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "klar").length;
  const people = members.filter((m) => tasks.some((t) => t.owner_user_id === m.user_id));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Totalt</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <Progress value={total ? (done / total) * 100 : 0} />
          <p className="text-sm text-muted-foreground font-mono tabular-nums">{done} av {total} klara</p>
        </CardContent>
      </Card>
      {people.length === 0 && <p className="text-sm text-muted-foreground">Ingen har uppgifter ännu.</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {people.map((p) => {
          const mine = tasks.filter((t) => t.owner_user_id === p.user_id);
          const d = mine.filter((t) => t.status === "klar").length;
          const next = mine.filter((t) => t.status !== "klar").slice(0, 3);
          return (
            <Card key={p.user_id}>
              <CardHeader className="pb-2"><CardTitle className="text-base"><Who id={p.user_id} map={byId} /></CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Progress value={mine.length ? (d / mine.length) * 100 : 0} />
                <p className="text-xs text-muted-foreground font-mono tabular-nums">{d} av {mine.length} klara</p>
                {next.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Inga öppna uppgifter.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {next.map((t) => <li key={t.id} className="break-words">• {t.title}</li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Senaste agentlogg</CardTitle></CardHeader>
        <CardContent>
          {log.length === 0 ? <p className="text-sm text-muted-foreground">Ingen agent har skrivit något än.</p> : (
            <ul className="space-y-2 text-sm">
              {log.map((l) => (
                <li key={l.id} className="break-words"><span className="font-medium">{l.agent}</span> <span className="text-xs text-muted-foreground">{fmt(l.created_at)}</span><br />{l.text}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PromptQueue({ isOwner }: { isOwner: boolean }) {
  const { user } = useStaffAuth();
  const { toast } = useToast();
  const { byId } = useMemberMap();
  const { data: prompts = [], isLoading } = useFlowPrompts();
  const { createPrompt, decidePrompt } = useFlowMutations();
  const [f, setF] = useState({ title: "", target: "lovable", risk: "normal", why: "", prompt: "" });

  const submit = async () => {
    if (!f.title.trim() || !f.prompt.trim()) {
      toast({ title: "Rubrik och prompt krävs", variant: "destructive" });
      return;
    }
    try {
      await createPrompt.mutateAsync({ ...f, title: f.title.trim(), prompt: f.prompt.trim() });
      setF({ title: "", target: "lovable", risk: "normal", why: "", prompt: "" });
      toast({ title: "Prompten är föreslagen" });
    } catch (e) { toast({ title: "Kunde inte spara", description: errText(e), variant: "destructive" }); }
  };
  const decide = async (id: string, approve: boolean) => {
    try { await decidePrompt.mutateAsync({ id, approve }); }
    catch (e) { toast({ title: "Kunde inte uppdatera", description: errText(e), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Ny prompt</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Rubrik" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={f.target} onValueChange={(v) => setF({ ...f, target: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lovable">Lovable</SelectItem>
                <SelectItem value="n8n">n8n</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
              </SelectContent>
            </Select>
            <Select value={f.risk} onValueChange={(v) => setF({ ...f, risk: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="read_only">Endast läsning</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="Varför?" value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} />
          <Textarea placeholder="Prompt" rows={6} value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} />
          <Button onClick={submit} disabled={createPrompt.isPending} className="w-full sm:w-auto">Föreslå</Button>
          {!isOwner && <p className="text-xs text-muted-foreground">En ägare måste godkänna prompten innan den körs.</p>}
        </CardContent>
      </Card>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : prompts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga promptar ännu.</p>
      ) : prompts.map((p) => {
        const own = p.created_by === user?.id;
        return (
          <Card key={p.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold break-words">{p.title}</span>
                <Badge variant={statusVariant(p.status)}>{PROMPT_STATUS[p.status] ?? p.status}</Badge>
                <Badge variant="outline">{p.target}</Badge>
                {p.risk === "read_only" && <Badge variant="outline">Endast läsning</Badge>}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Skriven av <Who id={p.created_by} map={byId} /> · {fmt(p.created_at)}</p>
                {p.approved_by && (
                  <p>{p.status === "avvisad" ? "Avvisad" : "Godkänd"} av <Who id={p.approved_by} map={byId} /> · {fmt(p.approved_at)}</p>
                )}
              </div>
              {p.why && <p className="text-sm break-words">{p.why}</p>}
              <details>
                <summary className="cursor-pointer text-sm text-primary">Visa prompt</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs font-mono">{p.prompt}</pre>
              </details>
              {(p.status === "klar" || p.status === "fel") && p.result && (
                <div className="rounded border p-2">
                  <p className="text-xs text-muted-foreground">Resultat {fmt(p.ran_at)}</p>
                  <pre className="whitespace-pre-wrap break-words text-xs font-mono">{p.result}</pre>
                </div>
              )}
              {p.status === "forslag" && isOwner && !own && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => decide(p.id, true)} disabled={decidePrompt.isPending}>Godkänn</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(p.id, false)} disabled={decidePrompt.isPending}>Avvisa</Button>
                </div>
              )}
              {p.status === "forslag" && (own || !isOwner) && <p className="text-xs text-muted-foreground">Väntar på att en annan ägare godkänner.</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TasksTab({ isOwner }: { isOwner: boolean }) {
  const { user } = useStaffAuth();
  const { toast } = useToast();
  const { members, byId } = useMemberMap();
  const { data: tasks = [] } = useFlowTasks();
  const { saveTask, setTaskStatus } = useFlowMutations();
  const [owner, setOwner] = useState<string>("alla");
  const [phase, setPhase] = useState<string>("alla");
  const [n, setN] = useState({ title: "", owner_user_id: "", phase: "idag", why: "", steps: "" });
  const newOwner = isOwner ? (n.owner_user_id || user?.id || "") : (user?.id ?? "");

  const list = tasks.filter((t) => (owner === "alla" || t.owner_user_id === owner) && (phase === "alla" || t.phase === phase));
  const add = async () => {
    if (!n.title.trim() || !newOwner) return;
    try {
      await saveTask.mutateAsync({ ...n, owner_user_id: newOwner, title: n.title.trim(), sort_order: tasks.length });
      setN({ ...n, title: "", why: "", steps: "" });
    } catch (e) { toast({ title: "Kunde inte spara", description: errText(e), variant: "destructive" }); }
  };
  const toggle = async (id: string, done: boolean) => {
    try { await setTaskStatus.mutateAsync({ id, status: done ? "klar" : "att_gora" }); }
    catch (e) { toast({ title: "Kunde inte uppdatera", description: errText(e), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alla">Alla personer</SelectItem>
            {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={phase} onValueChange={setPhase}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alla">Alla faser</SelectItem>
            {FLOW_PHASES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {list.length === 0 ? <p className="text-sm text-muted-foreground">Inga uppgifter här.</p> : list.map((t) => {
        const canEdit = isOwner || t.owner_user_id === user?.id;
        return (
          <Card key={t.id}>
            <CardContent className="flex gap-3 p-4">
              <Checkbox className="mt-1 h-5 w-5" disabled={!canEdit} checked={t.status === "klar"} onCheckedChange={(v) => toggle(t.id, !!v)} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className={`font-medium break-words ${t.status === "klar" ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                <div className="flex flex-wrap items-center gap-1 text-sm">
                  <Who id={t.owner_user_id} map={byId} />
                  <Badge variant="outline">{FLOW_PHASES.find((p) => p.key === t.phase)?.label}</Badge>
                  {t.status === "pagar" && <Badge variant="secondary">Pågår</Badge>}
                </div>
                {t.why && <p className="text-sm text-muted-foreground break-words">{t.why}</p>}
                {t.steps && <p className="text-sm whitespace-pre-wrap break-words">{t.steps}</p>}
                {t.done_at && (
                  <p className="text-xs text-muted-foreground">Avbockad av <Who id={t.done_by} map={byId} /> · {fmt(t.done_at)}</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Ny uppgift</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Rubrik" value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            {isOwner ? (
              <Select value={newOwner} onValueChange={(v) => setN({ ...n, owner_user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Person" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <div className="flex items-center rounded-md border px-3 text-sm">{byId.get(user?.id ?? "")?.full_name ?? "Du"}</div>
            )}
            <Select value={n.phase} onValueChange={(v) => setN({ ...n, phase: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FLOW_PHASES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Input placeholder="Varför?" value={n.why} onChange={(e) => setN({ ...n, why: e.target.value })} />
          <Textarea placeholder="Steg" rows={3} value={n.steps} onChange={(e) => setN({ ...n, steps: e.target.value })} />
          <Button onClick={add} disabled={saveTask.isPending}>Lägg till</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ChatTab() {
  const { user } = useStaffAuth();
  const { toast } = useToast();
  const { byId } = useMemberMap();
  const { data: msgs = [] } = useFlowMessages();
  const { sendMessage } = useFlowMutations();
  const [body, setBody] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  const send = async () => {
    const b = body.trim();
    if (!b) return;
    try { await sendMessage.mutateAsync(b); setBody(""); }
    catch (e) { toast({ title: "Kunde inte skicka", description: errText(e), variant: "destructive" }); }
  };
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {msgs.length === 0 && <p className="text-sm text-muted-foreground">Inga meddelanden ännu.</p>}
          {msgs.map((m) => {
            const mine = m.author === user?.id;
            const mem = byId.get(m.author);
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <p className="text-xs opacity-80">
                    {mem?.full_name ?? m.author_name ?? "Okänd"}{mem ? ` (${ROLE_LABEL[mem.role]})` : ""} · {fmt(m.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div className="flex gap-2">
          <Textarea rows={2} value={body} placeholder="Skriv ett meddelande" onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <Button onClick={send} disabled={sendMessage.isPending}>Skicka</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LogTab() {
  const { data: log = [], isLoading } = useFlowLog(200);
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (log.length === 0) return <p className="text-sm text-muted-foreground">Agentloggen är tom.</p>;
  return (
    <div className="space-y-2">
      {log.map((l) => (
        <Card key={l.id}><CardContent className="p-3 text-sm">
          <p><span className="font-medium">{l.agent}</span> <span className="text-xs text-muted-foreground">{fmt(l.created_at)}</span></p>
          <p className="whitespace-pre-wrap break-words">{l.text}</p>
        </CardContent></Card>
      ))}
    </div>
  );
}

function MembersTab() {
  const { toast } = useToast();
  const { members } = useMemberMap();
  const [search, setSearch] = useState("");
  const { data: candidates = [] } = useFlowCandidates(search.trim(), search.trim().length >= 2);
  const { setContributor } = useFlowMutations();
  const memberIds = new Set(members.map((m) => m.user_id));
  const change = async (userId: string, on: boolean) => {
    try { await setContributor.mutateAsync({ userId, on }); }
    catch (e) { toast({ title: "Kunde inte ändra", description: errText(e), variant: "destructive" }); }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Medlemmar</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => (
            <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0">
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.full_name}</span>
                <Badge variant={m.role === "owner" ? "default" : "outline"}>{ROLE_LABEL[m.role]}</Badge>
              </span>
              {m.role === "contributor" && (
                <Button size="sm" variant="outline" disabled={setContributor.isPending} onClick={() => change(m.user_id, false)}>Ta bort</Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Lägg till bidragsgivare</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Sök anställd (minst två bokstäver)" value={search} onChange={(e) => setSearch(e.target.value)} />
          {candidates.filter((c) => !memberIds.has(c.user_id)).map((c) => (
            <div key={c.user_id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span>{c.full_name}</span>
              <Button size="sm" disabled={setContributor.isPending} onClick={() => change(c.user_id, true)}>Ge rollen Bidragsgivare</Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Rollen Ägare kan inte delas ut här.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Flow() {
  const { data: isMember, isLoading } = useIsFlowMember();
  const { data: isOwner = false } = useIsFlowOwner();

  if (isLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!isMember) {
    return (
      <div className="p-6">
        <Card className="mx-auto max-w-lg"><CardContent className="flex flex-col items-center gap-2 p-8 text-center">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <p className="font-semibold">Ingen åtkomst</p>
          <p className="text-sm text-muted-foreground">CaballaFlow är bara för ägare och bidragsgivare.</p>
        </CardContent></Card>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">CaballaFlow</h1>
        <p className="text-sm text-muted-foreground">Byggplan, promptkö och samtal.</p>
      </div>
      <Tabs defaultValue="oversikt">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="oversikt">Översikt</TabsTrigger>
          <TabsTrigger value="promptar">Promptkö</TabsTrigger>
          <TabsTrigger value="uppgifter">Uppgifter</TabsTrigger>
          <TabsTrigger value="samtal">Samtal</TabsTrigger>
          <TabsTrigger value="logg">Agentlogg</TabsTrigger>
          {isOwner && <TabsTrigger value="medlemmar">Medlemmar</TabsTrigger>}
        </TabsList>
        <TabsContent value="oversikt"><Overview /></TabsContent>
        <TabsContent value="promptar"><PromptQueue isOwner={isOwner} /></TabsContent>
        <TabsContent value="uppgifter"><TasksTab isOwner={isOwner} /></TabsContent>
        <TabsContent value="samtal"><ChatTab /></TabsContent>
        <TabsContent value="logg"><LogTab /></TabsContent>
        {isOwner && <TabsContent value="medlemmar"><MembersTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
