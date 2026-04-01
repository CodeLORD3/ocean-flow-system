import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseISO, format, differenceInDays, isAfter, isBefore, startOfDay } from "date-fns";
import { Archive, CheckCircle, ArrowRight, ArrowUpDown, ArrowUp, ArrowDown, Search, CalendarIcon, X } from "lucide-react";
import { usePortalTabs } from "./PortalTabsContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type SortKey = "title" | "company" | "funded" | "rate" | "purchaseDate" | "maturityDate" | "duration" | "status";

export default function PortalArchive() {
  const { openOfferTab, switchTab } = usePortalTabs();

  const [searchOffer, setSearchOffer] = useState("");
  const [searchCompany, setSearchCompany] = useState("");
  const [maturityFrom, setMaturityFrom] = useState<Date | undefined>();
  const [maturityTo, setMaturityTo] = useState<Date | undefined>();
  const [sortKey, setSortKey] = useState<SortKey>("maturityDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="inline h-2.5 w-2.5 ml-0.5 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="inline h-2.5 w-2.5 ml-0.5 text-primary" />
      : <ArrowDown className="inline h-2.5 w-2.5 ml-0.5 text-primary" />;
  };

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["portal-archive"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*, companies(*)")
        .in("status", ["Closed", "Repaid"])
        .order("maturity_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredAndSorted = useMemo(() => {
    let list = [...offers];

    // Text filters
    if (searchOffer.trim()) {
      const q = searchOffer.toLowerCase();
      list = list.filter((o: any) => (o.title || "").toLowerCase().includes(q));
    }
    if (searchCompany.trim()) {
      const q = searchCompany.toLowerCase();
      list = list.filter((o: any) => (o.companies?.name || "").toLowerCase().includes(q));
    }

    // Date range filter
    if (maturityFrom) {
      list = list.filter((o: any) => o.maturity_date && !isBefore(startOfDay(parseISO(o.maturity_date)), startOfDay(maturityFrom)));
    }
    if (maturityTo) {
      list = list.filter((o: any) => o.maturity_date && !isAfter(startOfDay(parseISO(o.maturity_date)), startOfDay(maturityTo)));
    }

    // Sort
    list.sort((a: any, b: any) => {
      let cmp = 0;
      switch (sortKey) {
        case "title":
          cmp = (a.title || "").localeCompare(b.title || "");
          break;
        case "company":
          cmp = (a.companies?.name || "").localeCompare(b.companies?.name || "");
          break;
        case "funded":
          cmp = Number(a.funded_amount) - Number(b.funded_amount);
          break;
        case "rate":
          cmp = Number(a.interest_rate) - Number(b.interest_rate);
          break;
        case "purchaseDate":
          cmp = (a.purchase_date || "").localeCompare(b.purchase_date || "");
          break;
        case "maturityDate":
          cmp = (a.maturity_date || "").localeCompare(b.maturity_date || "");
          break;
        case "duration": {
          const dA = a.tenor_days ? Number(a.tenor_days) : (a.purchase_date && a.maturity_date ? differenceInDays(parseISO(a.maturity_date), parseISO(a.purchase_date)) : 0);
          const dB = b.tenor_days ? Number(b.tenor_days) : (b.purchase_date && b.maturity_date ? differenceInDays(parseISO(b.maturity_date), parseISO(b.purchase_date)) : 0);
          cmp = dA - dB;
          break;
        }
        case "status":
          cmp = (a.status || "").localeCompare(b.status || "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [offers, searchOffer, searchCompany, maturityFrom, maturityTo, sortKey, sortDir]);

  const hasActiveFilters = searchOffer || searchCompany || maturityFrom || maturityTo;

  if (isLoading) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading archive...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-foreground flex items-center gap-2">
          <Archive className="h-4 w-4 text-primary" />
          Archive
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">Completed investment offers that have been fully paid out.</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 border border-border bg-white p-3">
        <div className="flex-1 min-w-[140px] max-w-[200px]">
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Offer Name</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search offer..."
              value={searchOffer}
              onChange={(e) => setSearchOffer(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 min-w-[140px] max-w-[200px]">
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Company</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search company..."
              value={searchCompany}
              onChange={(e) => setSearchCompany(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="min-w-[130px]">
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Maturity From</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("h-8 w-full justify-start text-xs font-normal", !maturityFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-3 w-3 mr-1.5" />
                {maturityFrom ? format(maturityFrom, "d MMM yyyy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={maturityFrom} onSelect={setMaturityFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
        <div className="min-w-[130px]">
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Maturity To</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("h-8 w-full justify-start text-xs font-normal", !maturityTo && "text-muted-foreground")}>
                <CalendarIcon className="h-3 w-3 mr-1.5" />
                {maturityTo ? format(maturityTo, "d MMM yyyy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={maturityTo} onSelect={setMaturityTo} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => { setSearchOffer(""); setSearchCompany(""); setMaturityFrom(undefined); setMaturityTo(undefined); }}
          >
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto self-end pb-1.5">
          {filteredAndSorted.length} result{filteredAndSorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="border border-border bg-white">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border text-[10px] text-muted-foreground select-none">
              <th className="text-left p-2 pl-3 font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("title")}>Offer <SortIcon col="title" /></th>
              <th className="text-left p-2 font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("company")}>Company <SortIcon col="company" /></th>
              <th className="text-right p-2 font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("funded")}>Funded Amount <SortIcon col="funded" /></th>
              <th className="text-right p-2 font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("rate")}>Return <SortIcon col="rate" /></th>
              <th className="text-left p-2 font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("purchaseDate")}>Purchase Date <SortIcon col="purchaseDate" /></th>
              <th className="text-left p-2 font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("maturityDate")}>Maturity Date <SortIcon col="maturityDate" /></th>
              <th className="text-right p-2 font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("duration")}>Duration <SortIcon col="duration" /></th>
              <th className="text-center p-2 pr-3 font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("status")}>Status <SortIcon col="status" /></th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((offer: any, idx: number) => {
              const duration = offer.tenor_days ? Number(offer.tenor_days) : (offer.purchase_date && offer.maturity_date ? differenceInDays(parseISO(offer.maturity_date), parseISO(offer.purchase_date)) : null);
              return (
                <tr
                  key={offer.id}
                  onClick={() => openOfferTab(offer.id, offer.title)}
                  className={`border-b border-border/50 hover:bg-mackerel/10 cursor-pointer transition-colors h-8 ${idx % 2 === 1 ? "bg-muted/50" : ""}`}
                >
                  <td className="p-2 pl-3 text-foreground font-medium">{offer.title}</td>
                  <td className="p-2 text-muted-foreground">{offer.companies?.name || "—"}</td>
                  <td className="p-2 text-right text-foreground font-mono">{Number(offer.funded_amount).toLocaleString()} kr</td>
                  <td className="p-2 text-right text-mackerel font-semibold">{Number(offer.interest_rate).toFixed(1)}%</td>
                  <td className="p-2 text-muted-foreground">
                    {offer.purchase_date ? format(parseISO(offer.purchase_date), "d MMM yyyy") : "—"}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {offer.maturity_date ? format(parseISO(offer.maturity_date), "d MMM yyyy") : "—"}
                  </td>
                  <td className="p-2 text-right text-muted-foreground font-mono">
                    {duration !== null ? `${duration}d` : "—"}
                  </td>
                  <td className="p-2 pr-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold tracking-wide border text-mackerel bg-mackerel-light border-mackerel/30">
                      <CheckCircle className="h-2.5 w-2.5" />
                      {(offer.status || "CLOSED").toUpperCase()}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filteredAndSorted.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10">
                  {offers.length === 0 ? (
                    <div className="flex flex-col items-center text-center gap-2">
                      <Archive className="h-8 w-8 text-muted-foreground/50" />
                      <h3 className="text-sm font-semibold text-foreground">No completed deals yet</h3>
                      <p className="text-xs text-muted-foreground max-w-xs">Deals that have reached maturity and been fully paid out will appear here.</p>
                      <button
                        onClick={() => switchTab("/portal")}
                        className="mt-2 px-4 py-1.5 border border-primary text-primary text-[11px] font-semibold hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1"
                      >
                        Browse open opportunities <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground text-xs">No results match your filters.</div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
