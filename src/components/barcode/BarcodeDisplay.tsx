import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeDisplayProps {
  value: string;
  format?: string;
  width?: number;
  height?: number;
  showText?: boolean;
  className?: string;
}

export default function BarcodeDisplay({
  value,
  format = "EAN13",
  width = 2,
  height = 60,
  showText = true,
  className = "",
}: BarcodeDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format,
          width,
          height,
          displayValue: showText,
          fontSize: 14,
          margin: 10,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch {
        // Invalid barcode value, show nothing
      }
    }
  }, [value, format, width, height, showText]);

  if (!value) return null;

  return <svg ref={svgRef} className={className} />;
}
