/**
 * Mejlinloppet för leverantörsdokument (inkop@fiskskaldjur.se).
 *
 * Fyra vyer: utkast som väntar på attest, okända avsändare, stoppade
 * dubbletter/tolkningsfel och avsändarvitlistan. Ingenting bokförs här utan att
 * personal attesterar — attest av en följesedel skapar inköpsrapporten och
 * öppnar den för partibokföring.
 */
import { useEffect, useMemo, useState } from "react";
import { resolveStorageUrl } from "@/lib/signedStorage";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import { AlertTriangle, Copy, ExternalLink, Inbox, Loader2, Lock, Mail, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useSizeGrades } from "@/hooks/useSizeGrades";
import {
  useMailIntakeActions,
  useMailMessages,
  useMailRuns,
  useMailSenders,
  useSupplierDocuments,
} from "@/hooks/useSupplierDocuments";
import { SupplierCandidatesPanel } from "@/components/purchase/SupplierCandidatesPanel";

import {
  approveDeliveryNote,
  approveInvoice,
  matchInvoiceToLots,
  rejectDocument,
  type SupplierDocument,
} from "@/lib/supplierDocumentIntake";

const docTypeLabel: Record<string, string> = {
  foljesedel: "Följesedel",
  faktura: "Faktura",
  kreditnota: "Kreditnota",
  paminnelse: "Påminnelse/inkasso",
  ovrigt: "Övrigt",
  okand: "Okänt",
};


const ageHours = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

export function MailIntakePanel({ onOpenReport }: { onOpenReport?: (id: string) => void }) {
  const navigate = useNavigate();
  const { data: documents = [], isLoading } = useSupplierDocuments();
  const { data: messages = [] } = useMailMessages();
  const { data: senders = [] } = useMailSenders();
  const { data: runs = [] } = useMailRuns();
  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();
  const { data: sizeGrades = [] } = useSizeGrades();
  const { runIntake, saveSender, removeSender, ignoreMessage, setDocumentSupplier, invalidate } = useMailIntakeActions();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [newPattern, setNewPattern] = useState("");
  const [newSupplier, setNewSupplier] = useState<string>("");
  const [newPortal, setNewPortal] = useState(false);
  const [folder, setFolder] = useState("Test");

  const drafts = useMemo(
    () =>
      documents.filter(
        (d) => d.status === "utkast" && d.parse_status === "tolkad" && d.doc_type !== "paminnelse",
      ),
    [documents],
  );
  const reminders = useMemo(
    () => documents.filter((d) => d.doc_type === "paminnelse" || d.status === "endast_info"),
    [documents],
  );
  const problems = useMemo(
    () =>
      documents.filter(
        (d) => (d.status === "dubblett" || d.parse_status === "fel") && d.doc_type !== "paminnelse",
      ),
    [documents],
  );

  const unknownSenders = useMemo(
    () => messages.filter((m) => m.status === "okand_avsandare"),
    [messages],
  );
  const newsletters = useMemo(
    () => messages.filter((m) => m.status === "nyhetsbrev"),
    [messages],
  );
  const reminderMessages = useMemo(
    () => messages.filter((m) => m.status === "paminnelse"),
    [messages],
  );
  const tooLarge = useMemo(
    () => messages.filter((m) => m.status === "for_stort"),
    [messages],
  );

  const lastRun = runs[0];

  const handleApprove = async (doc: SupplierDocument) => {
    setBusyId(doc.id);
    setApproveError(null);
    try {
      if (doc.doc_type === "faktura" || doc.doc_type === "kreditnota") {
        const rows = await matchInvoiceToLots(doc);
        if (rows.length === 0) throw new Error("Inga preliminära partier matchade fakturan.");
        const n = await approveInvoice(doc, rows);
        toast({ title: "Faktura attesterad", description: `${n} partier fick fastställt pris.` });
      } else {
        if (products.length === 0) {
          throw new Error("Produktregistret är inte inläst ännu — vänta några sekunder och försök igen.");
        }
        const reportId = await approveDeliveryNote(doc, {
          products: products as any,
          suppliers: suppliers as any,
          sizeGrades: sizeGrades as any,
        });
        toast({ title: "Följesedel attesterad", description: "Inköpsrapporten är skapad — bokför partierna." });
        onOpenReport ? onOpenReport(reportId) : navigate("/purchase-reporting");
      }
      invalidate();
    } catch (e: any) {
      // Felet visas kvar på kortet — en toast som försvinner gör att attesten
      // ser ut att "inte göra något" när den i själva verket stoppats.
      console.error("Attest misslyckades", e);
      const msg = e?.message || e?.error_description || e?.details || "Okänt fel vid attest.";
      setApproveError(msg);
      toast({ title: "Kunde inte attestera", description: msg, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };


  const handleReject = async (doc: SupplierDocument) => {
    const reason = window.prompt("Orsak till avvisning?") ?? "";
    if (!reason.trim()) return;
    try {
      await rejectDocument(doc.id, reason.trim());
      toast({ title: "Dokumentet avvisat" });
      invalidate();
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b p-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Mail className="h-4 w-4" /> Mejlinlopp — leverantörsdokument
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {lastRun
              ? `Senaste läsning ${formatDistanceToNow(new Date(lastRun.started_at), { addSuffix: true, locale: sv })} (${lastRun.folder}) · ${lastRun.stored} nya · ${lastRun.unread_without_attachment} olästa utan bilaga`
              : "Ingen läsning körd ännu"}
            {lastRun && !lastRun.ok && " · senaste körning misslyckades"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={folder} onValueChange={setFolder}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Test">Testmapp</SelectItem>
              <SelectItem value="INBOX">Inkorgen</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={runIntake.isPending}
            onClick={() =>
              runIntake.mutate(
                { folder },
                {
                  onSuccess: (r) =>
                    toast({
                      title: "Läsning klar",
                      description: `${r.fetched} mejl lästa · ${r.stored} dokument · ${r.skipped} hoppade · ${r.unread_without_attachment} utan bilaga`,
                    }),
                  onError: (e: any) => toast({ title: "IMAP-fel", description: e.message, variant: "destructive" }),
                },
              )
            }
          >
            {runIntake.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Hämta nu
          </Button>
        </div>
      </div>

      <Tabs defaultValue="drafts" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 h-8 max-w-[calc(100%-1.5rem)] overflow-x-auto justify-start">
          <TabsTrigger value="drafts" className="text-xs">
            Väntar på attest
            {drafts.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{drafts.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="unknown" className="text-xs">
            Okända avsändare
            {unknownSenders.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{unknownSenders.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="problems" className="text-xs">
            Dubbletter och fel
            {problems.length + tooLarge.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{problems.length + tooLarge.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="reminders" className="text-xs">
            Påminnelser
            {reminders.length + reminderMessages.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{reminders.length + reminderMessages.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="newsletters" className="text-xs">
            Nyhetsbrev
            {newsletters.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{newsletters.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="candidates" className="text-xs">Leverantörsförslag</TabsTrigger>
          <TabsTrigger value="senders" className="text-xs">Vitlista</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="flex-1 min-h-0 m-0">
          <SupplierCandidatesPanel />
        </TabsContent>


        <TabsContent value="newsletters" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="divide-y">
              {newsletters.length === 0 && (
                <p className="p-6 text-center text-xs text-muted-foreground">
                  Inga utskick har sållats bort.
                </p>
              )}
              {newsletters.map((m) => (
                <div key={m.id} className="px-3 py-2">
                  <p className="text-xs font-medium truncate">{m.subject || "(utan ämne)"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {m.from_name ? `${m.from_name} — ` : ""}{m.from_email}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Nyhetsbrev/utskick — bilagor öppnas inte och kan inte bokföras.
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>


        <TabsContent value="reminders" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="divide-y">
              {reminderMessages.map((m) => (
                <div key={m.id} className="p-3">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">Påminnelse/inkasso</Badge>
                    <span className="truncate">{m.subject || "(utan ämne)"}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {m.from_name ? `${m.from_name} — ` : ""}{m.from_email} — bilagan öppnas inte.
                  </p>
                </div>
              ))}
              {reminders.length + reminderMessages.length === 0 && (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  <Inbox className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  Inga påminnelser eller inkassokrav.
                </div>
              )}
              {reminders.map((doc) => (
                <div key={doc.id} className="p-3">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">Påminnelse/inkasso</Badge>
                    <span className="truncate">{doc.file_name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Endast information — tolkas inte och påverkar inte inköp, lager eller priser.
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>


        <TabsContent value="drafts" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="divide-y">
              {isLoading && <p className="p-4 text-xs text-muted-foreground">Läser in…</p>}
              {!isLoading && drafts.length === 0 && (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  <Inbox className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  Inga dokument väntar på attest.
                </div>
              )}
              {/* Ett dokument i taget: kön öppnas först när detta är attesterat eller avvisat. */}
              {drafts.slice(0, 1).map((doc) => (
                <DraftQueueCard
                  key={doc.id}
                  doc={doc}
                  suppliers={suppliers as any[]}
                  busy={busyId === doc.id}
                  queueLength={drafts.length}
                  error={approveError}
                  onSetSupplier={(supplier_id) =>
                    setDocumentSupplier.mutate(
                      { id: doc.id, supplier_id },
                      { onSuccess: () => toast({ title: "Leverantör kopplad" }) },
                    )
                  }
                  onApprove={() => handleApprove(doc)}
                  onReject={() => handleReject(doc)}
                />
              ))}

              {drafts.length > 1 && (
                <div className="p-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  {drafts.length - 1} dokument väntar i kön — nästa visas när det här är attesterat eller avvisat.
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>


        <TabsContent value="unknown" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="divide-y">
              {unknownSenders.length === 0 && (
                <p className="p-8 text-center text-xs text-muted-foreground">Inga parkerade mejl från okända avsändare.</p>
              )}
              {unknownSenders.map((m) => (
                <div key={m.id} className="p-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-xs font-medium truncate">{m.from_email}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {m.subject} · {m.attachment_count} bilagor · bilagan är inte öppnad
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Select
                      onValueChange={(supplierId) =>
                        saveSender.mutate(
                          { pattern: m.from_email ?? "", supplier_id: supplierId },
                          { onSuccess: () => toast({ title: "Avsändare vitlistad", description: "Nästa mejl tolkas automatiskt." }) },
                        )
                      }
                    >
                      <SelectTrigger className="h-7 w-[170px] max-w-full text-xs"><SelectValue placeholder="Koppla till leverantör" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        saveSender.mutate(
                          { pattern: m.from_email ?? "", supplier_id: null, is_portal: true },
                          {
                            onSuccess: () =>
                              toast({
                                title: "Vitlistad som förmedlare",
                                description: "Leverantören identifieras per dokument (t.ex. Fortnox).",
                              }),
                          },
                        )
                      }
                    >
                      Förmedlare
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => ignoreMessage.mutate(m.id)}>
                      Ignorera
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="problems" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="divide-y">
              {problems.length === 0 && tooLarge.length === 0 && (
                <p className="p-8 text-center text-xs text-muted-foreground">Inga dubbletter eller tolkningsfel.</p>
              )}
              {tooLarge.map((m) => (
                <div key={m.id} className="p-3 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-600" />
                  <div className="min-w-[200px] flex-1">
                    <p className="text-xs font-medium truncate">{m.subject || "(utan ämne)"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {m.from_name ? `${m.from_name} — ` : ""}{m.from_email} — mejlet är för stort att tolka
                      automatiskt, ligger kvar oläst i inkorgen för manuell hantering.
                    </p>
                  </div>
                </div>
              ))}
              {problems.map((d) => (

                <div key={d.id} className="p-3 flex items-start gap-2">
                  {d.status === "dubblett" ? (
                    <Copy className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-destructive" />
                  )}
                  <div className="min-w-[200px] flex-1">
                    <p className="text-xs font-medium truncate">{d.file_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.status === "dubblett"
                        ? `Redan registrerad${d.document_number ? ` (nr ${d.document_number})` : ""} — läggs inte upp igen`
                        : d.parse_error}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="senders" className="flex-1 min-h-0 m-0">
          <div className="p-3 flex items-center gap-2 border-b">
            <Input
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              placeholder="adress@leverantor.se eller leverantor.se"
              className="h-8 text-xs"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
              <Checkbox checked={newPortal} onCheckedChange={(v) => setNewPortal(!!v)} />
              Förmedlare
            </label>
            <Select value={newSupplier} onValueChange={setNewSupplier} disabled={newPortal}>
              <SelectTrigger className="h-8 w-[170px] max-w-full text-xs"><SelectValue placeholder="Leverantör" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newPattern.trim() || (!newSupplier && !newPortal)}
              onClick={() =>
                saveSender.mutate(
                  { pattern: newPattern, supplier_id: newPortal ? null : newSupplier, is_portal: newPortal },
                  {
                    onSuccess: () => {
                      setNewPattern("");
                      setNewSupplier("");
                      setNewPortal(false);
                    },
                  },
                )
              }
            >
              Lägg till
            </Button>
          </div>
          <ScrollArea className="h-full">
            <div className="divide-y">
              {senders.length === 0 && (
                <p className="p-8 text-center text-xs text-muted-foreground">Inga vitlistade avsändare — inget tolkas ännu.</p>
              )}
              {senders.map((s) => (
                <div key={s.id} className="p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-xs font-medium truncate">{s.pattern}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.kind === "domain" ? "Domän" : "Adress"} ·{" "}
                      {s.is_portal
                        ? "förmedlare — leverantör per dokument"
                        : suppliers.find((sup: any) => sup.id === s.supplier_id)?.name ?? "ingen leverantör"}
                      {!s.active && " · inaktiv"}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeSender.mutate(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Ett dokument i kön: liten förhandsvisning av de tolkade raderna plus attest/avvisa.
 * Nästa dokument visas först när det här är hanterat.
 */
function DraftQueueCard({
  doc,
  suppliers,
  busy,
  queueLength,
  onSetSupplier,
  onApprove,
  onReject,
}: {
  doc: SupplierDocument;
  suppliers: any[];
  busy: boolean;
  queueLength: number;
  onSetSupplier: (supplierId: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const lines = doc.parsed?.lines ?? [];
  const old = ageHours(doc.created_at) > 48;
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveStorageUrl(doc.storage_path ? `/storage/v1/object/public/leverantorsdokument/${doc.storage_path}` : null)
      .then((u) => active && setFileUrl(u))
      .catch(() => active && setFileUrl(null));
    return () => {
      active = false;
    };
  }, [doc.storage_path]);

  return (
    <div className="p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-[200px] flex-1">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Badge variant="outline" className="h-4 px-1 text-[10px]">{docTypeLabel[doc.doc_type] ?? doc.doc_type}</Badge>
            <span className="truncate">{doc.file_name}</span>
            {queueLength > 1 && (
              <span className="text-[10px] text-muted-foreground">1 av {queueLength}</span>
            )}
            {old && (
              <span className="flex items-center gap-1 text-amber-600 text-[10px]">
                <AlertTriangle className="h-3 w-3" /> äldre än 48 h
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {doc.parsed?.document?.supplier_name ?? "Okänd leverantör"}
            {!doc.supplier_id ? " · välj leverantör innan attest" : ""}
            {doc.document_number ? ` · nr ${doc.document_number}` : ""}
            {doc.document_date ? ` · ${doc.document_date}` : ""} · {lines.length} rader
            {doc.total_ex_vat ? ` · ${doc.total_ex_vat.toLocaleString("sv-SE")} ex moms` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {fileUrl && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
              <a href={fileUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" /> Öppna filen
              </a>
            </Button>
          )}
          {!doc.supplier_id && (
            <Select onValueChange={onSetSupplier}>
              <SelectTrigger className="h-7 w-[190px] max-w-full text-xs">
                <SelectValue placeholder="Välj leverantör" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onReject}>
            Avvisa
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={busy || !doc.supplier_id}
            onClick={onApprove}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            Attestera
          </Button>
        </div>
      </div>

      {lines.length > 0 && (
        <div className="rounded border bg-muted/30 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="px-2 py-1 text-left font-medium">Produkt</th>
                <th className="px-2 py-1 text-right font-medium">Mängd</th>
                <th className="px-2 py-1 text-right font-medium">À-pris</th>
                <th className="px-2 py-1 text-right font-medium">Belopp</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {lines.slice(0, 8).map((l: any, i: number) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1 font-sans max-w-[280px] truncate">
                    {l.name ?? l.product_name ?? l.description ?? "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {l.quantity != null ? `${Number(l.quantity).toLocaleString("sv-SE")} ${l.unit ?? ""}` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {l.unit_price != null ? Number(l.unit_price).toLocaleString("sv-SE") : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {l.total != null ? Number(l.total).toLocaleString("sv-SE") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.length > 8 && (
            <p className="px-2 py-1 text-[10px] text-muted-foreground">
              +{lines.length - 8} rader till — syns i inköpsrapporten efter attest.
            </p>
          )}
        </div>
      )}
    </div>
  );
}


export default MailIntakePanel;
