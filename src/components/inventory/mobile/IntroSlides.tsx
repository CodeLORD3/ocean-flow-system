import { useState } from "react";
import { Hand, ListChecks, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const SLIDES = [
  {
    icon: Hand,
    title: "Så räknar du",
    body: "En vara i taget. Tryck plus eller minus, eller skriv siffran, och gå vidare.",
  },
  {
    icon: ListChecks,
    title: "Hoppa över går bra",
    body: "Hittar du inte varan trycker du Hoppa över eller Finns inte här.",
  },
  {
    icon: ShieldCheck,
    title: "Efter inskick",
    body: "Butikschefen godkänner räkningen. Först då ändras lagret.",
  },
];

const SEEN_KEY = "count-intro-seen";

export function hasSeenIntro() {
  try {
    return localStorage.getItem(SEEN_KEY) === "ja";
  } catch {
    return true;
  }
}

/** Tre korta introskärmar — en mening per skärm, en bild per skärm. */
export default function IntroSlides({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const Icon = slide.icon;

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "ja");
    } catch {
      /* ignoreras */
    }
    setIndex(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[360px] gap-5 rounded-3xl p-5">
        <div className="flex h-36 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="h-16 w-16 text-primary" />
        </div>
        <div className="space-y-2 text-center">
          <h2 className="font-heading text-[22px] font-semibold leading-tight">{slide.title}</h2>
          <p className="text-[18px] leading-snug text-muted-foreground">{slide.body}</p>
        </div>
        <div className="flex justify-center gap-2">
          {SLIDES.map((s, i) => (
            <span
              key={s.title}
              className={`h-2 w-6 rounded-full ${i === index ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => (index < SLIDES.length - 1 ? setIndex(index + 1) : close())}
          className="h-16 min-h-[56px] w-full rounded-2xl bg-primary text-[19px] font-semibold text-primary-foreground active:brightness-110"
        >
          {index < SLIDES.length - 1 ? "Nästa" : "Jag är klar"}
        </button>
        <button
          type="button"
          onClick={close}
          className="h-14 min-h-[56px] w-full rounded-2xl border border-border text-[17px] font-medium"
        >
          Hoppa över hjälpen
        </button>
      </DialogContent>
    </Dialog>
  );
}
