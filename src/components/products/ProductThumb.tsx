import { useState } from "react";
import { Fish } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ProductThumbProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** Disable click-to-enlarge */
  static?: boolean;
}

/** Landscape 4:3 product thumbnail (~80x56px) used in product lists and receiving. */
export function ProductThumb({ src, alt, className, static: isStatic }: ProductThumbProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasImage = !!src && !failed;

  const box = cn(
    "w-20 h-14 shrink-0 rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center",
    className,
  );

  if (!hasImage) {
    return (
      <div className={box} aria-hidden>
        <Fish className="h-5 w-5 text-muted-foreground/50" />
      </div>
    );
  }

  const img = (
    <img
      src={src as string}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );

  if (isStatic) return <div className={box}>{img}</div>;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(box, "hover:ring-2 hover:ring-primary/40 transition")}
        title={alt}
      >
        {img}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-2">
          <img src={src as string} alt={alt} className="w-full h-auto rounded-md" />
          <p className="text-center text-sm text-muted-foreground pb-1">{alt}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
