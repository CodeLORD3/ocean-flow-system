import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Tydlig väg tillbaka till bilden man kom ifrån. Visas överst på sidan så länge
 * adressen har ?frombild=<bild-id>, på samma sätt som man går tillbaka från en
 * enskild kundbeställning till listan.
 */
export default function ReturnToImageBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const id = new URLSearchParams(location.search).get("frombild");
  if (!id) return null;

  return (
    <div className="sticky top-0 z-40 border-b bg-background/95 px-3 py-1.5 backdrop-blur">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-sm font-medium"
        onClick={() => navigate(`/image-feed?bild=${id}`)}
      >
        <ArrowLeft className="h-4 w-4" />
        Tillbaka till bilden
      </Button>
    </div>
  );
}
