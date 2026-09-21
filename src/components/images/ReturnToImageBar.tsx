import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { previousNav, popNav, subscribeNav, type NavEntry } from "@/lib/navHistory";

/**
 * Tydlig väg tillbaka dit man kom ifrån — på varje sida i systemet.
 *
 * Tre fall, i den ordningen:
 *  1. ?frombild=<bild-id> — tillbaka till bilden man tryckte sig vidare från
 *  2. ?retur=<sökväg>&returtext=<namn> — en väg tillbaka som länken bestämt
 *  3. annars sidan man senast stod på (navigeringskedjan)
 */
export default function ReturnToImageBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [prev, setPrev] = useState<NavEntry | null>(() => previousNav());

  useEffect(() => {
    const update = () => setPrev(previousNav());
    update();
    return subscribeNav(update);
  }, [location.pathname, location.search]);

  const params = new URLSearchParams(location.search);
  const bildId = params.get("frombild");
  const retur = params.get("retur");

  const to = bildId ? `/image-feed?bild=${bildId}` : retur || prev?.url;
  if (!to) return null;

  const label = bildId
    ? "Tillbaka till bilden"
    : retur
      ? `Tillbaka till ${params.get("returtext") || "föregående sida"}`
      : `Tillbaka till ${prev?.title || "föregående sida"}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <Button
        className="pointer-events-auto h-14 max-w-full gap-3 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
        onClick={() => {
          if (!bildId && !retur) popNav();
          navigate(to);
        }}
      >
        <ArrowLeft className="h-6 w-6 shrink-0" />
        <span className="truncate">{label}</span>
      </Button>
    </div>
  );
}

