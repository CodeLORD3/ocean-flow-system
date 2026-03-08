import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Loader2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  zoom: number;
}

export function PdfViewer({ url, zoom }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // Load PDF and render all pages
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(null);

    const loadPdf = async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled) return;

        setNumPages(pdf.numPages);

        // Clear container
        container.innerHTML = "";
        canvasRefs.current.clear();

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;

          const viewport = page.getViewport({ scale: 1.5 * zoom });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.maxWidth = `${viewport.width}px`;
          canvas.style.borderRadius = "4px";
          if (i > 1) canvas.style.marginTop = "12px";

          container.appendChild(canvas);
          canvasRefs.current.set(i, canvas);

          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Kunde inte ladda PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPdf();
    return () => { cancelled = true; };
  }, [url, zoom]);

  return (
    <div className="w-full">
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="text-center py-12 text-sm text-destructive">{error}</div>
      )}
      <div ref={containerRef} className="flex flex-col items-center" />
    </div>
  );
}
