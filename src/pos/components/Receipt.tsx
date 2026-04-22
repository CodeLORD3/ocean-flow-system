import { formatSek } from "../lib/money";

export interface ReceiptData {
  receiptNo: number;
  occurredAt: string;
  cashierName: string;
  method: "kontant" | "kort" | "swish";
  totalOre: number;
  tenderedOre?: number;
  changeOre?: number;
  controlCode: string;
  lines: Array<{
    name: string;
    quantity: number;
    unit: "piece" | "kg" | "custom";
    unit_price_ore: number;
    line_total_ore: number;
    vat_rate: number;
  }>;
  vatBreakdown: { rate: number; gross: number; net: number; vat: number }[];
}

const METHOD_LABEL: Record<ReceiptData["method"], string> = {
  kontant: "Kontant",
  kort: "Kort",
  swish: "Swish",
};

export default function Receipt({ data }: { data: ReceiptData }) {
  const ts = new Date(data.occurredAt).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
  });

  return (
    <div className="pos-print font-mono text-[12px] bg-card text-foreground rounded-md border border-border p-4 max-h-[60vh] overflow-auto">
      <div className="text-center">
        <div className="font-bold uppercase">Fisk &amp; Skaldjursspecialisten</div>
        <div>Storgatan 1, 111 22 Stockholm</div>
        <div>Org.nr 556123-4567 · Butik 001 · Term 01</div>
      </div>

      <div className="mt-3 flex justify-between">
        <span>Kvitto #{data.receiptNo}</span>
        <span>{ts}</span>
      </div>
      <div>Kassör: {data.cashierName}</div>

      <hr className="my-2 border-dashed border-border" />

      <table className="w-full">
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td colSpan={2} className="pt-1">{l.name}</td>
            </tr>
          )).flatMap((row, i) => [
            row,
            <tr key={`d-${i}`}>
              <td className="pl-3 text-muted-foreground">
                {data.lines[i].unit === "kg"
                  ? `${data.lines[i].quantity.toLocaleString("sv-SE", { maximumFractionDigits: 3 })} kg × ${formatSek(data.lines[i].unit_price_ore, { withCurrency: false })}`
                  : `${data.lines[i].quantity} st × ${formatSek(data.lines[i].unit_price_ore, { withCurrency: false })}`}
              </td>
              <td className="text-right tabular">
                {formatSek(data.lines[i].line_total_ore)}
              </td>
            </tr>,
          ])}
        </tbody>
      </table>

      <hr className="my-2 border-dashed border-border" />

      <div className="flex justify-between font-bold text-base">
        <span>TOTALT</span>
        <span className="tabular">{formatSek(data.totalOre)}</span>
      </div>

      <div className="mt-2">
        <div className="font-semibold">Moms</div>
        <table className="w-full">
          <tbody>
            {data.vatBreakdown.map((v) => (
              <tr key={v.rate}>
                <td>{v.rate}%</td>
                <td className="text-right tabular">Netto {formatSek(v.net, { withCurrency: false })}</td>
                <td className="text-right tabular">Moms {formatSek(v.vat, { withCurrency: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <hr className="my-2 border-dashed border-border" />

      <div className="flex justify-between">
        <span>Betalsätt</span>
        <span>{METHOD_LABEL[data.method]}</span>
      </div>
      {data.tenderedOre !== undefined && (
        <>
          <div className="flex justify-between">
            <span>Mottaget</span>
            <span className="tabular">{formatSek(data.tenderedOre)}</span>
          </div>
          <div className="flex justify-between">
            <span>Växel</span>
            <span className="tabular">{formatSek(data.changeOre ?? 0)}</span>
          </div>
        </>
      )}

      <hr className="my-2 border-dashed border-border" />

      <div className="text-[10px] break-all">
        Kontrollkod: {data.controlCode}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        SKVFS 2021:17/18 · Spara kvittot
      </div>

      <div className="mt-3 text-center">Tack för ditt köp!</div>
    </div>
  );
}
