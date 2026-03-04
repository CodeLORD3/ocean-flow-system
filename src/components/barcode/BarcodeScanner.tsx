import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, X, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose?: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "barcode-scanner-container";

  const startScanning = async () => {
    try {
      setError(null);
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          onScan(decodedText);
          stopScanning();
        },
        () => {} // ignore errors during scan
      );
      setScanning(true);
    } catch (err: any) {
      setError(err?.message || "Kunde inte starta kameran. Kontrollera att du gett tillgång.");
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  return (
    <Card className="shadow-card border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Streckkodsskanner</span>
          </div>
          <div className="flex gap-2">
            {!scanning ? (
              <Button size="sm" className="gap-1.5 text-xs h-7" onClick={startScanning}>
                <Camera className="h-3 w-3" /> Starta kamera
              </Button>
            ) : (
              <Button size="sm" variant="destructive" className="gap-1.5 text-xs h-7" onClick={stopScanning}>
                <X className="h-3 w-3" /> Stoppa
              </Button>
            )}
            {onClose && (
              <Button size="sm" variant="ghost" className="h-7" onClick={() => { stopScanning(); onClose(); }}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        <div
          id={containerId}
          className="relative w-full rounded-lg overflow-hidden bg-black/90"
          style={{ minHeight: scanning ? 280 : 120 }}
        >
          {!scanning && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <ScanLine className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-xs">Klicka "Starta kamera" för att scanna</p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{error}</p>
        )}

        <p className="text-[10px] text-muted-foreground">
          Rikta kameran mot en EAN-13 streckkod. Koden läses automatiskt.
        </p>
      </CardContent>
    </Card>
  );
}
