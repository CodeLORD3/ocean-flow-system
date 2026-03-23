import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, Eye, Settings, CreditCard, Layout, Save } from "lucide-react";
import { toast } from "sonner";

const SECTION_DEFAULTS = {
  showDealSummary: true,
  showInvestmentTerms: true,
  showReturnView: true,
  showUnderlyingTransaction: true,
  showRiskSecurity: true,
  showPledges: true,
  showDocuments: true,
  showROICalculator: true,
  showCountdown: true,
  showFundingProgress: true,
  showPastOffers: true,
};

export default function InvestorPortal() {
  const [sections, setSections] = useState({ ...SECTION_DEFAULTS });
  const [paymentConfig, setPaymentConfig] = useState({
    bankName: "",
    accountHolder: "",
    iban: "",
    bic: "",
    reference: "",
    instructions: "",
    swishNumber: "",
    acceptSwish: false,
    acceptBankTransfer: true,
  });

  const toggleSection = (key: keyof typeof SECTION_DEFAULTS) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    // In future: persist to portal_settings or a new config table
    toast.success("Inställningar sparade");
  };

  const portalUrl = `${window.location.origin}/portal`;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Investor Portal
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Konfigurera vad investerare ser och hur de kan investera
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" asChild>
            <a href={portalUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3 w-3" /> Öppna Investor Portal
            </a>
          </Button>
          <Button size="sm" className="h-7 text-[10px] gap-1" onClick={handleSave}>
            <Save className="h-3 w-3" /> Spara
          </Button>
        </div>
      </div>

      {/* Portal Preview Link */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold">Portal URL</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Dela denna länk med dina investerare
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-[10px] bg-muted px-2 py-1 rounded font-mono">{portalUrl}</code>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[9px]"
                onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success("Kopierad!"); }}
              >
                Kopiera
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Display Settings */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-xs font-bold flex items-center gap-1.5 mb-4">
              <Layout className="h-3.5 w-3.5 text-primary" />
              Visa / Dölj sektioner
            </h3>
            <p className="text-[10px] text-muted-foreground mb-3">
              Välj vilka sektioner investerare ser på erbjudandets detaljsida
            </p>
            <div className="space-y-2.5">
              {([
                ["showDealSummary", "Deal Summary", "Produkt, ID, Sektor, Struktur"],
                ["showInvestmentTerms", "Investment Terms", "Total, Min ticket, Tenor, Return, Repayment"],
                ["showReturnView", "Return — Investor View", "Investment, Return %, Profit, Total Payout"],
                ["showUnderlyingTransaction", "Underlying Transaction", "Product, Origin, Volume, Purchase/Sales, Margin"],
                ["showRiskSecurity", "Risk & Security", "Collateral, LTV, Primary/Secondary Exit, Downside"],
                ["showPledges", "Pledges", "Lista med investerarnas åtaganden"],
                ["showDocuments", "Dokument", "Bifogade PDF:er och bilder"],
                ["showROICalculator", "ROI Calculator", "Investerare kan beräkna sin avkastning"],
                ["showCountdown", "Countdown Timer", "Dagar kvar till förfall"],
                ["showFundingProgress", "Funding Progress", "Progressbar för finansieringsstatus"],
                ["showPastOffers", "Tidigare Erbjudanden", "Historik med återbetalda erbjudanden"],
              ] as const).map(([key, label, desc]) => (
                <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <span className="text-[11px] font-medium">{label}</span>
                    <p className="text-[9px] text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={sections[key as keyof typeof SECTION_DEFAULTS]}
                    onCheckedChange={() => toggleSection(key as keyof typeof SECTION_DEFAULTS)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Payment Configuration */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-xs font-bold flex items-center gap-1.5 mb-4">
                <CreditCard className="h-3.5 w-3.5 text-primary" />
                Betalningsinställningar
              </h3>
              <p className="text-[10px] text-muted-foreground mb-3">
                Konfigurera hur investerare skickar pengar
              </p>

              <div className="space-y-3">
                {/* Payment methods */}
                <div className="space-y-2">
                  <span className="text-[10px] font-medium text-muted-foreground">Betalningsmetoder</span>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[11px]">Banköverföring</span>
                    <Switch
                      checked={paymentConfig.acceptBankTransfer}
                      onCheckedChange={v => setPaymentConfig(p => ({ ...p, acceptBankTransfer: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[11px]">Swish</span>
                    <Switch
                      checked={paymentConfig.acceptSwish}
                      onCheckedChange={v => setPaymentConfig(p => ({ ...p, acceptSwish: v }))}
                    />
                  </div>
                </div>

                {/* Bank details */}
                {paymentConfig.acceptBankTransfer && (
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <span className="text-[10px] font-medium text-muted-foreground">Bankuppgifter</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Bank</label>
                        <Input
                          value={paymentConfig.bankName}
                          onChange={e => setPaymentConfig(p => ({ ...p, bankName: e.target.value }))}
                          className="h-7 text-xs"
                          placeholder="t.ex. SEB"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Kontoinnehavare</label>
                        <Input
                          value={paymentConfig.accountHolder}
                          onChange={e => setPaymentConfig(p => ({ ...p, accountHolder: e.target.value }))}
                          className="h-7 text-xs"
                          placeholder="FiskHandel AB"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">IBAN</label>
                        <Input
                          value={paymentConfig.iban}
                          onChange={e => setPaymentConfig(p => ({ ...p, iban: e.target.value }))}
                          className="h-7 text-xs"
                          placeholder="SE00 0000 0000 0000 0000"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">BIC / SWIFT</label>
                        <Input
                          value={paymentConfig.bic}
                          onChange={e => setPaymentConfig(p => ({ ...p, bic: e.target.value }))}
                          className="h-7 text-xs"
                          placeholder="ESSESESS"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-muted-foreground">Referens / OCR (visas till investerare)</label>
                      <Input
                        value={paymentConfig.reference}
                        onChange={e => setPaymentConfig(p => ({ ...p, reference: e.target.value }))}
                        className="h-7 text-xs"
                        placeholder="Ange referens som investerare ska använda"
                      />
                    </div>
                  </div>
                )}

                {/* Swish */}
                {paymentConfig.acceptSwish && (
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <span className="text-[10px] font-medium text-muted-foreground">Swish</span>
                    <div className="space-y-1">
                      <label className="text-[9px] text-muted-foreground">Swish-nummer</label>
                      <Input
                        value={paymentConfig.swishNumber}
                        onChange={e => setPaymentConfig(p => ({ ...p, swishNumber: e.target.value }))}
                        className="h-7 text-xs"
                        placeholder="123 456 7890"
                      />
                    </div>
                  </div>
                )}

                {/* Instructions */}
                <div className="space-y-1 pt-2 border-t border-border/50">
                  <label className="text-[9px] text-muted-foreground">Betalningsinstruktioner (visas till investerare efter pledge)</label>
                  <Textarea
                    value={paymentConfig.instructions}
                    onChange={e => setPaymentConfig(p => ({ ...p, instructions: e.target.value }))}
                    className="text-xs min-h-[60px]"
                    placeholder="t.ex. Vänligen överför beloppet inom 3 bankdagar med angivet referensnummer..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Portal Settings */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-xs font-bold flex items-center gap-1.5 mb-3">
                <Settings className="h-3.5 w-3.5 text-primary" />
                Portal-inställningar
              </h3>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <div>
                    <span className="text-[11px] font-medium">Portal Status</span>
                    <p className="text-[9px] text-muted-foreground">Stäng av för att göra portalen otillgänglig</p>
                  </div>
                  <Badge variant="outline" className="text-[9px] bg-success/10 text-success border-success/30">Aktiv</Badge>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <div>
                    <span className="text-[11px] font-medium">Kräv inloggning</span>
                    <p className="text-[9px] text-muted-foreground">Investerare måste logga in för att se erbjudanden</p>
                  </div>
                  <Badge variant="outline" className="text-[9px]">Ja</Badge>
                </div>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-[11px] font-medium">Registrerade investerare</span>
                    <p className="text-[9px] text-muted-foreground">Antal konton med rollen "client"</p>
                  </div>
                  <Badge variant="outline" className="text-[9px]">—</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
