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
    <div className="sticky top-0 z-40 border-b bg-background/95 px-3 py-2 backdrop-blur">
      <Button
        variant="secondary"
        className="h-12 w-full justify-start gap-3 rounded-xl px-4 text-base font-semibold shadow-sm sm:w-auto"
        onClick={() => {
          if (!bildId && !retur) popNav();
          navigate(to);
        }}
      >
        <ArrowLeft className="h-6 w-6" />
        {label}
      </Button>

    </div>
  );
}
