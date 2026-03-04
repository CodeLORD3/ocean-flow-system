import { useRef } from "react";
import BarcodeDisplay from "./BarcodeDisplay";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface BarcodeLabelProps {
  barcode: string;
  productName: string;
  sku?: string;
  price?: number;
  unit?: string;
}

export default function BarcodeLabel({ barcode, productName, sku, price, unit }: BarcodeLabelProps) {
  const labelRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!labelRef.current) return;
    const printWindow = window.open("", "_blank", "width=400,height=300");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Streckkod - ${productName}</title>
          <style>
            @page { size: 60mm 40mm; margin: 2mm; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 4mm; text-align: center; }
            .name { font-size: 10px; font-weight: bold; margin-bottom: 2px; }
            .sku { font-size: 8px; color: #666; margin-bottom: 4px; }
            .price { font-size: 12px; font-weight: bold; margin-top: 2px; }
            svg { max-width: 100%; }
          </style>
        </head>
        <body>
          <div class="name">${productName}</div>
          ${sku ? `<div class="sku">${sku}</div>` : ""}
          ${labelRef.current.querySelector("svg")?.outerHTML || ""}
          ${price ? `<div class="price">${price} kr/${unit || "kg"}</div>` : ""}
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="inline-flex flex-col items-center gap-1 p-3 border border-border rounded-lg bg-white" ref={labelRef}>
      <p className="text-xs font-medium text-foreground">{productName}</p>
      {sku && <p className="text-[10px] text-muted-foreground">{sku}</p>}
      <BarcodeDisplay value={barcode} height={40} width={1.5} />
      {price != null && <p className="text-xs font-bold text-foreground">{price} kr/{unit || "kg"}</p>}
      <Button variant="outline" size="sm" className="gap-1 text-[10px] h-6 mt-1" onClick={handlePrint}>
        <Printer className="h-3 w-3" /> Skriv ut
      </Button>
    </div>
  );
}
