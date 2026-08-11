import { useState } from "react";
import { Fish } from "lucide-react";
import ProductImagesDialog from "@/components/products/ProductImagesDialog";
import { cn } from "@/lib/utils";

interface ProductThumbProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** Disable click-to-enlarge */
  static?: boolean;
  /** Produktens id – gör att alla egentagna bilder kan bläddras i visaren */
  productId?: string | null;
}

/** Landscape 4:3 product thumbnail (~80x56px) used in product lists and receiving. */
export function ProductThumb({ src, alt, className, static: isStatic, productId }: ProductThumbProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasImage = !!src && !failed;

  const box = cn(
    "w-20 h-14 shrink-0 rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center",
    className,
  );

  const openable = !isStatic && (hasImage || !!productId);

  if (!hasImage) {
    if (!openable) {
      return (
        <div className={box} aria-hidden>
          <Fish className="h-5 w-5 text-muted-foreground/50" />
        </div>
      );
    }
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className={cn(box, "hover:ring-2 hover:ring-primary/40 transition")}
          title={`Visa bilder – ${alt}`}
        >
          <Fish className="h-5 w-5 text-muted-foreground/50" />
        </button>
        <ProductImagesDialog
          open={open}
          onOpenChange={setOpen}
          productId={productId}
          productName={alt}
          catalogUrl={null}
        />
      </>
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
      <ProductImagesDialog
        open={open}
        onOpenChange={setOpen}
        productId={productId}
        productName={alt}
        catalogUrl={src}
      />
    </>
  );
}
