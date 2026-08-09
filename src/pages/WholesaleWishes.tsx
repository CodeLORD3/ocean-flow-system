import { useEffect, useMemo, useState } from "react";
import { usePublishedWishes } from "@/hooks/useShopWishes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNotificationFlash } from "@/lib/notificationFlash";

const STATUS_COLORS: Record<string, string> = {
  Inget: "bg-muted-foreground/40",
  Pågående: "bg-amber-500",
  Klar: "bg-emerald-500",
};

export default function WholesaleWishes() {
  const { flashClass } = useNotificationFlash("shop_wish");
  const { wishes, isLoading } = usePublishedWishes();
  const [store, setStore] = useState<string>("all");

  useEffect(() => {
    const onFocus = (e: Event) => {
      const name = (e as CustomEvent).detail as string;
      if (name) setStore(name);
    };
    window.addEventListener("wishes:focus-store", onFocus);
    return () => window.removeEventListener("wishes:focus-store", onFocus);
  }, []);


  const stores = useMemo(
    () => Array.from(new Set(wishes.map((w) => w.storeName))).sort((a, b) => a.localeCompare(b, "sv")),
    [wishes]
  );

  const filtered = useMemo(
    () => (store === "all" ? wishes : wishes.filter((w) => w.storeName === store)),
    [wishes, store]
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Star className="h-5 w-5 text-amber-500" /> Butikernas önskemål
          </h1>
          <p className="text-xs text-muted-foreground">
            Endast önskemål som butikerna har publicerat till grossisten visas här.
          </p>
        </div>
        <Select value={store} onValueChange={setStore}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Alla butiker" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla butiker ({wishes.length})</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Publicerade önskemål ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>Butik</TableHead>
                <TableHead>Önskemål</TableHead>
                <TableHead className="w-20">Typ</TableHead>
                <TableHead className="w-32">Önskat datum</TableHead>
                <TableHead className="w-32">Publicerat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Laddar…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Inga publicerade önskemål ännu
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((w) => (
                <TableRow key={w.id} className={flashClass(w.id)}>
                  <TableCell>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn("inline-block h-3.5 w-3.5 rounded-sm", STATUS_COLORS[w.status] ?? STATUS_COLORS.Inget)} />
                      {w.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{w.storeName}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{w.title}</div>
                    {w.description && (
                      <div className="text-xs text-muted-foreground">{w.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={w.category === "Kund" ? "default" : "secondary"} className="text-[10px]">
                      {w.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {w.due_date ? format(parseISO(w.due_date), "d MMM yyyy", { locale: sv }) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {w.published_at ? format(parseISO(w.published_at), "d MMM yyyy", { locale: sv }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
