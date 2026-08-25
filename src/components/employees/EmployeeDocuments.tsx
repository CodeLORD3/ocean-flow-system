import { useState } from "react";
import { FileText, Trash2, Upload, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  DOC_TYPES, useEmployeeDocuments, useUploadEmployeeDocument,
  useDeleteEmployeeDocument, employeeDocumentUrl, EmployeeDocument,
} from "@/hooks/useEmployees";

/** Dokumentarkiv per person: avtal, intyg, certifikat med giltighetsdatum. */
export function EmployeeDocuments({ employeeId }: { employeeId: string }) {
  const { toast } = useToast();
  const { data: docs = [], isLoading } = useEmployeeDocuments(employeeId);
  const upload = useUploadEmployeeDocument();
  const remove = useDeleteEmployeeDocument();

  const [docType, setDocType] = useState("anstallningsavtal");
  const [title, setTitle] = useState("");
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const submit = async () => {
    if (!file) return;
    try {
      await upload.mutateAsync({ employeeId, docType, title, expiresAt: expires || null, file });
      setFile(null); setTitle(""); setExpires("");
      toast({ title: "Dokumentet är uppladdat" });
    } catch (e: any) {
      toast({ title: "Uppladdningen misslyckades", description: e.message, variant: "destructive" });
    }
  };

  const open = async (d: EmployeeDocument) => {
    const url = await employeeDocumentUrl(d.file_path);
    if (url) window.open(url, "_blank");
    else toast({ title: "Kunde inte öppna filen", variant: "destructive" });
  };

  const expiringSoon = (d: EmployeeDocument) => {
    if (!d.expires_at) return false;
    return new Date(d.expires_at).getTime() - Date.now() < 60 * 86400000;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Typ</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Titel</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Filnamn används om tomt" />
        </div>
        <div>
          <Label>Giltigt t.o.m. (valfritt)</Label>
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        <div>
          <Label>Fil</Label>
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <Button onClick={submit} disabled={!file || upload.isPending} size="sm">
        <Upload className="mr-2 h-4 w-4" /> Ladda upp
      </Button>

      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Hämtar dokument…</p>}
        {!isLoading && docs.length === 0 && (
          <p className="text-sm text-muted-foreground">Inga dokument sparade ännu.</p>
        )}
        {docs.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.title}</p>
              <p className="text-xs text-muted-foreground">
                {DOC_TYPES.find((t) => t.value === d.doc_type)?.label ?? d.doc_type}
                {d.expires_at && ` · giltigt t.o.m. ${d.expires_at}`}
              </p>
            </div>
            {expiringSoon(d) && (
              <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                <AlertTriangle className="h-3 w-3" /> Går ut
              </Badge>
            )}
            <Button size="icon" variant="ghost" onClick={() => open(d)} aria-label="Öppna">
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => remove.mutate(d)} aria-label="Ta bort">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
