import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Check, X, Pencil, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useCustomerPreferences,
  useDeletePreference,
  useSavePreference,
} from "@/hooks/useRetailCustomerProfile";

/**
 * Permanenta kundpreferenser, t.ex. "Räkor – föredrar stora".
 * Skilt från den fria anteckningsloggen: preferenser är strukturerade och listbara.
 */
export function CustomerPreferencesCard({
  customerId,
  readOnly,
  compact,
}: {
  customerId: string;
  readOnly?: boolean;
  /** Kompakt läge på Översikt: bara de viktigaste, ingen redigering. */
  compact?: boolean;
}) {
  const { data: prefs = [] } = useCustomerPreferences(customerId);
  const save = useSavePreference();
  const remove = useDeletePreference();
  const [adding, setAdding] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const add = async () => {
    const body = adding.trim();
    if (!body) return;
    await save.mutateAsync({ customer_id: customerId, body, sort_order: prefs.length });
    setAdding("");
    toast.success("Önskemålet är sparat.");
  };

  const list = compact ? prefs.slice(0, 4) : prefs;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Önskemål och preferenser</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 && (
          <p className="text-xs text-muted-foreground">Inga registrerade önskemål.</p>
        )}
        <ul className="space-y-1.5">
          {list.map((p) => (
            <li
              key={p.id}
              className="flex items-start gap-2 rounded-md border border-border/70 px-2.5 py-1.5 text-sm"
            >
              <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {editId === p.id ? (
                <>
                  <Input
                    className="h-8 flex-1 text-sm"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        save.mutate({ id: p.id, customer_id: customerId, body: editBody.trim() });
                        setEditId(null);
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      save.mutate({ id: p.id, customer_id: customerId, body: editBody.trim() });
                      setEditId(null);
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 leading-snug">{p.body}</span>
                  {!readOnly && !compact && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditId(p.id);
                          setEditBody(p.body);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => remove.mutate(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        {!readOnly && !compact && (
          <div className="flex gap-2 pt-1">
            <Input
              className="h-9"
              placeholder="Nytt önskemål, t.ex. Lax – alltid utan skinn"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <Button className="h-9" onClick={add}>
              <Plus className="mr-1 h-4 w-4" /> Lägg till
            </Button>
          </div>
        )}
        {compact && prefs.length > list.length && (
          <p className="text-xs text-muted-foreground">
            +{prefs.length - list.length} fler under Anteckningar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
