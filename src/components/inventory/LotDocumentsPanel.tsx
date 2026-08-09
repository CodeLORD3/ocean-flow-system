import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import {
  LOT_DOCUMENT_TYPES,
  documentTypeLabel,
  openLotDocumentFile,
  useAddLotDocument,
  useDeleteLotDocument,
  useInheritedLotDocuments,
  useLotDocuments,
  type LotDocumentRow,
} from "@/hooks/useLotDocuments";

interface Props {
  lotId: string;
  /** Endast chefer får ta bort dokument. */
  canDelete?: boolean;
}

/** Dokumentregister för ett parti, med moderpartiets dokument som referens. */
export default function LotDocumentsPanel({ lotId, canDelete = false }: Props) {
  const { data: docs = [], isLoading } = useLotDocuments(lotId);
  const { data: inherited = [] } = useInheritedLotDocuments(lotId);
  const add = useAddLotDocument();
  const del = useDeleteLotDocument();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("fangstintyg");
  const [number, setNumber] = useState("");
  const [issuer, setIssuer] = useState("");
  const [issued, setIssued] = useState("");
  const [validTo, setValidTo] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setType("fangstintyg");
    setNumber("");
    setIssuer("");
    setIssued("");
    setValidTo("");
    setFile(null);
  };

  const submit = async () => {
    try {
      await add.mutateAsync({
        lotId,
        documentType: type,
        documentNumber: number,
        issuer,
        issuedDate: issued,
        validTo,
        file,
      });
      toast.success("Dokumentet är registrerat på partiet.");
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Dokumentet kunde inte sparas.");
    }
  };

  const openFile = async (doc: LotDocumentRow) => {
    if (!doc.file_path) return;
    try {
      await openLotDocumentFile(doc.file_path);
    } catch (e: any) {
      toast.error(e.message || "Filen kunde inte öppnas.");
    }
  };

  const row = (doc: LotDocumentRow & { parentLotNumber?: string }, isInherited = false) => (
    <div
      key={doc.id}
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 py-1.5 text-xs"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <FileText className="h-3 w-3 text-primary" />
          <span className="font-medium text-foreground">{documentTypeLabel(doc.document_type)}</span>
          {doc.document_number && (
            <span className="font-mono text-[11px] text-muted-foreground">{doc.document_number}</span>
          )}
          {isInherited && (
            <Badge variant="outline" className="text-[10px]">
              Ärvt från {doc.parentLotNumber || "moderparti"}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          {doc.issuer && <span>{doc.issuer}</span>}
          {doc.issued_date && <span>Utfärdat {doc.issued_date}</span>}
          {doc.valid_to && <span>Giltigt t.o.m. {doc.valid_to}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {doc.file_path && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => openFile(doc)}>
            <Paperclip className="h-3 w-3" /> {doc.file_name || "Fil"}
          </Button>
        )}
        {canDelete && !isInherited && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive"
            onClick={() => del.mutate(doc)}
            aria-label="Ta bort dokument"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase text-muted-foreground">Dokument</p>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-3 w-3" /> Nytt dokument
        </Button>
      </div>

      {open && (
        <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Dokumenttyp</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOT_DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Dokumentnummer</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Utfärdare</Label>
            <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Utfärdat</Label>
              <Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Giltigt t.o.m.</Label>
              <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px]">Fil (valfritt)</Label>
            <Input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="h-8 text-xs"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.xml"
            />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button size="sm" className="h-7 text-[11px]" onClick={submit} disabled={add.isPending}>
              Spara dokument
            </Button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-[11px] text-muted-foreground">Hämtar dokument…</p>}
      {!isLoading && docs.length === 0 && inherited.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Inga dokument registrerade. Fångstintyg och övriga handlingar läggs upp här så att de följer partiet
          även när det bearbetas vidare.
        </p>
      )}

      {docs.map((d) => row(d))}
      {(inherited as any[]).map((d) => row(d, true))}
    </div>
  );
}
