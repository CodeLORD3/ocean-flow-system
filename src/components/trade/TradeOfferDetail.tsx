import { useState } from "react";
import { ArrowLeft, FileText, Users, DollarSign, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface TradeOfferDetailProps {
  offer: any;
  pledges: any[];
  onBack: () => void;
  onStatusChange: (status: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );
}

export default function TradeOfferDetail({ offer, pledges, onBack, onStatusChange, onEdit, onDelete }: TradeOfferDetailProps) {
  const [activeTab, setActiveTab] = useState<"details" | "investors">("details");
  
  const target = Number(offer.target_amount);
  const funded = Number(offer.funded_amount);
  const rate = Number(offer.interest_rate);
  const progress = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
  const profitKr = Math.round(target * (rate / 100));
  const totalPayout = target + profitKr;

  const now = new Date();
  const maturity = new Date(offer.maturity_date);
  const daysLeft = Math.ceil((maturity.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const tenorDays = offer.tenor_days ?? (offer.purchase_date
    ? Math.ceil((maturity.getTime() - new Date(offer.purchase_date).getTime()) / (1000 * 60 * 60 * 24))
    : null);

  let annualReturn = offer.annual_return ? Number(offer.annual_return) : null;
  if (!annualReturn && tenorDays && tenorDays > 0) {
    annualReturn = Math.round((rate / tenorDays) * 365 * 100) / 100;
  }

  const repaymentLabel = offer.repayment_type === "rolling" ? "Löpande" : "Bullet";

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      Open: "bg-success/10 text-success border-success/30",
      Funded: "bg-primary/10 text-primary border-primary/30",
      Closed: "bg-destructive/10 text-destructive border-destructive/30",
      Repaid: "bg-muted text-muted-foreground border-border",
    };
    return map[status] || "";
  };

  const totalPledged = pledges.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={onBack}>
          <ArrowLeft className="h-3 w-3" /> Tillbaka
        </Button>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={onEdit}>
              <Pencil className="h-3 w-3" /> Redigera
            </Button>
          )}
          {onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="h-3 w-3" /> Ta bort
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ta bort erbjudande?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Är du säker på att du vill ta bort "{offer.title}"? Detta kan inte ångras.
                    {pledges.length > 0 && (
                      <span className="block mt-2 font-semibold text-destructive">
                        Varning: Det finns {pledges.length} investeringar kopplade till detta erbjudande.
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Ta bort
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Badge variant="outline" className={`text-[9px] ${statusBadge(offer.status)}`}>
            {offer.status}
          </Badge>
          <Select value={offer.status} onValueChange={onStatusChange}>
            <SelectTrigger className="h-6 w-24 text-[9px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Open", "Funded", "Closed", "Repaid"].map(s => (
                <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Funding Progress */}
      <Card>
        <CardContent className="p-3 space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Funding Progress</span>
            <span>{funded.toLocaleString()} / {target.toLocaleString()} kr ({progress.toFixed(1)}%)</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="text-[9px] text-muted-foreground text-right">
            {daysLeft > 0 ? `${daysLeft} dagar kvar` : "Expired"}
          </div>
        </CardContent>
      </Card>

      {/* Tab switcher */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("details")}
          className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors ${
            activeTab === "details" ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
          }`}
        >
          Offer Details
        </button>
        <button
          onClick={() => setActiveTab("investors")}
          className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "investors" ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
          }`}
        >
          <Users className="h-3 w-3" />
          Investors ({pledges.length})
        </button>
      </div>

      {activeTab === "details" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-3">
                <h3 className="text-[11px] font-bold text-primary tracking-wider mb-2">DEAL SUMMARY</h3>
                <InfoRow label="Product" value={offer.title} />
                <InfoRow label="Product-ID" value={offer.product_id_display} />
                <InfoRow label="Status" value={offer.status} />
                <InfoRow label="Sector" value={offer.sector || "Seafood Trading"} />
                <InfoRow label="Structure" value={offer.structure || "Trade Finance"} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <h3 className="text-[11px] font-bold text-primary tracking-wider mb-2">INVESTMENT TERMS</h3>
                <InfoRow label="Total Investment" value={`${target.toLocaleString()} kr`} />
                <InfoRow label="Minimum Ticket" value={offer.min_pledge ? `${Number(offer.min_pledge).toLocaleString()} kr` : "—"} />
                <InfoRow label="Tenor" value={tenorDays ? `${tenorDays} days` : "—"} />
                <InfoRow label="Expected Return" value={`${rate.toFixed(1)}%`} />
                <InfoRow label="Annual Return" value={annualReturn ? `${annualReturn.toFixed(1)}%` : "—"} />
                <InfoRow label="Repayment" value={repaymentLabel} />
              </CardContent>
            </Card>
          </div>

          {/* Return (Investor View) */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <h3 className="text-xs font-bold text-primary tracking-wider mb-3">RETURN — INVESTOR VIEW</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold">{target.toLocaleString()} kr</div>
                  <div className="text-[9px] text-muted-foreground">Investment</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-success">{rate.toFixed(1)}%</div>
                  <div className="text-[9px] text-muted-foreground">Return %</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-success">+{profitKr.toLocaleString()} kr</div>
                  <div className="text-[9px] text-muted-foreground">Profit</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold">{totalPayout.toLocaleString()} kr</div>
                  <div className="text-[9px] text-muted-foreground">Total Payout</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-3">
                <h3 className="text-[11px] font-bold text-primary tracking-wider mb-2">UNDERLYING TRANSACTION</h3>
                <InfoRow label="Product" value={offer.title} />
                <InfoRow label="Origin" value={offer.origin} />
                <InfoRow label="Volume" value={offer.volume || "—"} />
                <InfoRow label="Purchase Price" value={offer.purchase_price ? `${Number(offer.purchase_price).toLocaleString()} kr` : "—"} />
                <InfoRow label="Sales Value" value={offer.sales_value ? `${Number(offer.sales_value).toLocaleString()} kr` : "—"} />
                <InfoRow label="Gross Margin" value={offer.gross_margin ? `${Number(offer.gross_margin).toFixed(1)}%` : "—"} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <h3 className="text-[11px] font-bold text-primary tracking-wider mb-2">RISK & SECURITY</h3>
                <InfoRow label="Collateral" value={offer.collateral || "Inventory"} />
                <InfoRow label="LTV" value={offer.ltv ? `${Number(offer.ltv).toFixed(1)}%` : "—"} />
                <InfoRow label="Primary Exit" value={offer.primary_exit} />
                <InfoRow label="Secondary Exit" value={offer.secondary_exit} />
                <InfoRow label="Downside" value={offer.downside || offer.risk_note} />
              </CardContent>
            </Card>
          </div>

          {offer.document_url && (
            <a href={offer.document_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-[10px] text-primary hover:underline">
              <FileText className="h-3 w-3" /> Visa bifogat dokument (PDF)
            </a>
          )}
        </>
      )}

      {activeTab === "investors" && (
        <div className="space-y-4">
          {/* Funding summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[9px] text-muted-foreground tracking-wider mb-1">TOTAL PLEDGED</div>
                <div className="text-lg font-bold text-foreground font-mono">{totalPledged.toLocaleString()} kr</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[9px] text-muted-foreground tracking-wider mb-1">TARGET</div>
                <div className="text-lg font-bold text-foreground font-mono">{target.toLocaleString()} kr</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[9px] text-muted-foreground tracking-wider mb-1">REMAINING</div>
                <div className="text-lg font-bold text-foreground font-mono">{Math.max(0, target - totalPledged).toLocaleString()} kr</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border text-[9px] text-muted-foreground tracking-wider">
                    <th className="text-left p-2 pl-3 font-medium">INVESTOR</th>
                    <th className="text-right p-2 font-medium">AMOUNT</th>
                    <th className="text-left p-2 font-medium">DATE</th>
                    <th className="text-center p-2 pr-3 font-medium">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {pledges.map(p => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-2 pl-3 text-foreground font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 bg-muted flex items-center justify-center text-[8px] text-muted-foreground font-bold">
                            {(p.user_id || "?").substring(0, 2).toUpperCase()}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">{p.user_id?.substring(0, 8) || "—"}...</span>
                        </div>
                      </td>
                      <td className="p-2 text-right font-mono font-semibold text-foreground">{Number(p.amount).toLocaleString()} kr</td>
                      <td className="p-2 text-muted-foreground">{new Date(p.created_at).toLocaleDateString("sv-SE")}</td>
                      <td className="p-2 pr-3 text-center">
                        <Badge variant="outline" className="text-[8px]">{p.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {pledges.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground text-xs">
                        No investors have committed to this offer yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Admin actions */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] h-7"
              onClick={() => onStatusChange("Funded")}
              disabled={offer.status === "Funded"}
            >
              <DollarSign className="h-3 w-3 mr-1" /> Mark as Fully Funded
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => onStatusChange("Closed")}
              disabled={offer.status === "Closed"}
            >
              Close Offer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
