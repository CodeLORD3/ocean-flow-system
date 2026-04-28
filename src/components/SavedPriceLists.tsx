import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { generatePriceListPdf } from "@/lib/priceListPdf";

interface PriceListRow {
  id: string;
  name: string;
  store_id: string | null;
  total_products: number;
  created_at: string;
  created_by: string | null;
}

interface Props {
  /** When true, shows all price lists across stores (wholesale view). */
  allStores?: boolean;
}

export default function SavedPriceLists({ allStores = false }: Props) {
  const { activeStoreId, activeStoreName } = useSite() as any;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["price_lists", allStores ? "all" : activeStoreId],
    queryFn: async () => {
      let q = supabase
        .from("price_lists")
        .select("*, stores(name)")
        .order("created_at", { ascending: false });
      if (!allStores && activeStoreId) q = q.eq("store_id", activeStoreId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as (PriceListRow & { stores: { name: string } | null })[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["price_list_items", expanded],
    enabled: !!expanded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_list_items")
        .select("*")
        .eq("price_list_id", expanded as string)
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("price_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price_lists"] });
      toast({ title: "Prislista borttagen" });
    },
  });

  const downloadList = async (list: PriceListRow) => {
    const { data, error } = await supabase
      .from("price_list_items")
      .select("*")
      .eq("price_list_id", list.id)
      .order("sort_order");
    if (error || !data) {
      toast({ title: "Kunde inte hämta prislista", variant: "destructive" });
      return;
    }
    const rows = data.map((r: any) => ({
      category: r.category || "",
      name: r.product_name,
      sku: r.sku || "",
      unit: r.unit || "",
      price: Number(r.price),
    }));
    generatePriceListPdf(activeStoreName || null, rows, {
      dateStr: format(new Date(list.created_at), "yyyy-MM-dd"),
      listName: list.name,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Sparade prislistor
          <Badge variant="outline" className="ml-2">{lists.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-2">Laddar…</p>
        ) : lists.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Inga sparade prislistor ännu.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Namn</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Produkter</TableHead>
                <TableHead className="text-right">Åtgärder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((l) => {
                const open = expanded === l.id;
                return (
                  <>
                    <TableRow key={l.id}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setExpanded(open ? null : l.id)}
                        >
                          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{l.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(l.created_at), "yyyy-MM-dd HH:mm")}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{l.total_products}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-7 text-xs"
                            onClick={() => downloadList(l)}
                          >
                            <Download className="h-3 w-3" /> PDF
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => {
                              if (confirm("Ta bort prislistan?")) deleteList.mutate(l.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow key={l.id + "-items"}>
                        <TableCell colSpan={5} className="bg-muted/30">
                          {items.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">Inga rader.</p>
                          ) : (
                            <div className="max-h-72 overflow-y-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Produkt</TableHead>
                                    <TableHead>Kategori</TableHead>
                                    <TableHead>Enhet</TableHead>
                                    <TableHead className="text-right">Pris</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {items.map((it) => (
                                    <TableRow key={it.id}>
                                      <TableCell className="text-xs">{it.product_name}</TableCell>
                                      <TableCell className="text-[10px] text-muted-foreground">{it.category}</TableCell>
                                      <TableCell className="text-[10px] text-muted-foreground">{it.unit}</TableCell>
                                      <TableCell className="text-right text-xs tabular-nums">
                                        {Number(it.price).toFixed(2).replace(".", ",")} kr
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
