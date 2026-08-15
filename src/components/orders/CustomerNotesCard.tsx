import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useAddCustomerNote,
  useCustomerNotes,
  useDeleteCustomerNote,
} from "@/hooks/useRetailCustomerProfile";

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });

/** Intern anteckningslogg: text, datum och medarbetare. */
export function CustomerNotesCard({
  customerId,
  readOnly,
  limit,
}: {
  customerId: string;
  readOnly?: boolean;
  limit?: number;
}) {
  const { data: notes = [] } = useCustomerNotes(customerId);
  const add = useAddCustomerNote();
  const remove = useDeleteCustomerNote();
  const [body, setBody] = useState("");

  const save = async () => {
    const text = body.trim();
    if (!text) return;
    await add.mutateAsync({ customer_id: customerId, body: text });
    setBody("");
    toast.success("Anteckningen är sparad.");
  };

  const list = limit ? notes.slice(0, limit) : notes;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Anteckningar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!readOnly && !limit && (
          <div className="space-y-2">
            <Textarea
              rows={2}
              placeholder="Intern anteckning om kunden…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="flex justify-end">
              <Button className="h-9" onClick={save} disabled={!body.trim()}>
                Spara anteckning
              </Button>
            </div>
          </div>
        )}

        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">Inga anteckningar ännu.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((n) => (
              <li key={n.id} className="rounded-md border border-border/70 p-2.5 text-sm">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono tabular-nums">{stamp(n.created_at)}</span>
                  <span>·</span>
                  <span>{n.created_by_name || "Okänd"}</span>
                  {!readOnly && !limit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto h-6 w-6"
                      onClick={() => remove.mutate(n.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 leading-snug">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
        {limit && notes.length > list.length && (
          <p className="text-xs text-muted-foreground">
            +{notes.length - list.length} fler under fliken Anteckningar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
