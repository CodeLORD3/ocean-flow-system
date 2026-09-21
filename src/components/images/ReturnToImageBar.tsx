import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Tydlig väg tillbaka dit man kom ifrån. Visas överst på sidan så länge
 * adressen har ?frombild=<bild-id> (tillbaka till bilden) eller
 * ?retur=<sökväg>&returtext=<namn> (tillbaka till t.ex. min sida), på samma
 * sätt som man går tillbaka från en enskild kundbeställning till listan.
 */
export default function ReturnToImageBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const bildId = params.get("frombild");
  const retur = params.get("retur");
  if (!bildId && !retur) return null;

  const to = bildId ? `/image-feed?bild=${bildId}` : retur!;
  const label = bildId ? "Tillbaka till bilden" : `Tillbaka till ${params.get("returtext") || "föregående sida"}`;

  return (
    <div className="sticky top-0 z-40 border-b bg-background/95 px-3 py-1.5 backdrop-blur">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-sm font-medium"
        onClick={() => navigate(to)}
      >
        <ArrowLeft className="h-4 w-4" />
        {label}
      </Button>
    </div>
  );
}
