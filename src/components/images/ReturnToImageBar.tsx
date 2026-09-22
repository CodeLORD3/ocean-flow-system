import { ArrowLeft, X } from "lucide-react";
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
  const [hidden, setHidden] = useState(false);
  /** Körs en uppgift i helskärm ska raden inte ligga över uppgiftens knappar. */
  const [taskRunning, setTaskRunning] = useState(() => !!document.body.dataset.taskRun);

  useEffect(() => {
    const onRun = (e: Event) => setTaskRunning(!!(e as CustomEvent).detail?.open);
    window.addEventListener("task-run-open", onRun as EventListener);
    return () => window.removeEventListener("task-run-open", onRun as EventListener);
  }, []);

  useEffect(() => {
    const update = () => setPrev(previousNav());
    update();
    return subscribeNav(update);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setHidden(false);
  }, [location.pathname, location.search]);

  const params = new URLSearchParams(location.search);
  const bildId = params.get("frombild");
  const retur = params.get("retur");

  const to = bildId ? `/image-feed?bild=${bildId}` : retur || prev?.url;
  if (!to || hidden) return null;

  const label = bildId
    ? "Tillbaka till bilden"
    : retur
      ? `Tillbaka till ${params.get("returtext") || "föregående sida"}`
      : `Tillbaka till ${prev?.title || "föregående sida"}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-start px-3 sm:bottom-0 sm:justify-end sm:pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-primary pr-1 shadow-lg">
        <Button
          className="h-10 max-w-full gap-2 rounded-full bg-transparent px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-foreground/10"
          onClick={() => {
            if (!bildId && !retur) popNav();
            navigate(to);
          }}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
        <button
          type="button"
          aria-label="Stäng tillbaka-knappen"
          onClick={() => setHidden(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

