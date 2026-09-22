import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock, Map, MapPin, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { useAddAdhocTask, useTaskRegister } from "@/hooks/useTasks";
import { asciiFold } from "@/lib/asciiFold";
import { ZonePickMap } from "@/components/tasks/ZonePickMap";
import type { FloorPlan, MapZone } from "@/hooks/useStoreMap";

const STEPS = [
  { n: 1, label: "Vad ska göras?" },
  { n: 2, label: "Var & vem" },
  { n: 3, label: "Tid & klart" },
] as const;

export type NewTaskArea = { id: string; name: string; number: number };
export type NewTaskStaff = {
  id: string;
  first_name: string;
  last_name: string;
  profile_image_url?: string | null;
};

function nowTime(offsetMinutes = 0) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const DURATIONS = [5, 15, 30, 60];

/** Ny uppgift i tre steg: vad, var & vem, tid. Enkelt nu — mer senare. */
export function NewTaskDialog({
  open,
  onOpenChange,
  storeId,
  day,
  areas,
  staff,
  plan,
  zones,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string | null;
  day: string;
  areas: NewTaskArea[];
  staff: NewTaskStaff[];
  /** Butikens karta, så man kan peka ut området istället för att minnas namnet. */
  plan?: FloorPlan | null;
  zones?: MapZone[];
  onCreated?: (taskId: string) => void;
}) {
  const addAdhoc = useAddAdhocTask();
  const { data: register = [] } = useTaskRegister(storeId);
  const [step, setStep] = useState(1);
  /** Först väljer man om uppgiften finns sedan tidigare eller är helt ny. */
  const [mode, setMode] = useState<"ny" | "finns" | null>(null);
  const [existingSearch, setExistingSearch] = useState("");
  const [existingZone, setExistingZone] = useState<string | null>(null);
  const [existingMap, setExistingMap] = useState(false);
  const [task, setTask] = useState("");
  const [zone, setZone] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  const [timeMode, setTimeMode] = useState<"now" | "later" | "own">("now");
  const [time, setTime] = useState(nowTime());
  const [minutes, setMinutes] = useState<number | null>(null);
  const [ownMinutes, setOwnMinutes] = useState("");
  const [note, setNote] = useState("");
  const [pickOnMap, setPickOnMap] = useState(false);
  const personRef = useRef<HTMLDivElement>(null);
  const [reqPhoto, setReqPhoto] = useState(false);
  const [reqNote, setReqNote] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setMode(null);
    setExistingSearch("");
    setExistingZone(null);
    setExistingMap(false);
    setTask("");
    setZone(null);
    setPerson(null);
    setPersonSearch("");
    setTimeMode("now");
    setTime(nowTime());
    setMinutes(null);
    setOwnMinutes("");
    setNote("");
    setPickOnMap(false);
    setReqPhoto(false);
    setReqNote(false);
  }, [open]);

  const people = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    const list = [...staff].sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "sv"),
    );
    if (!q) return list;
    return list.filter((s) => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q));
  }, [staff, personSearch]);

  const chosenPerson = staff.find((s) => s.id === person) ?? null;
  const chosenArea = areas.find((a) => a.id === zone) ?? null;
  const finalMinutes = minutes ?? (ownMinutes ? Number(ownMinutes) : null);
  const finalTime = timeMode === "now" ? nowTime() : time;

  const existingList = useMemo(() => {
    // Tolerant sökning: å/ä/ö likställs och varje ord får matcha var som helst,
    // så "stad" och "städa golv" hittar "Städa samtliga golvbrunnar".
    const words = asciiFold(existingSearch).toLowerCase().split(/\s+/).filter(Boolean);
    return register
      .filter((r) => (existingZone ? r.zoneId === existingZone : true))
      .filter((r) => {
        if (!words.length) return true;
        const hay = asciiFold(`${r.task} ${r.note ?? ""} ${r.doers.map((d) => d.name).join(" ")}`).toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => b.doneTimes - a.doneTimes || a.task.localeCompare(b.task, "sv"))
      .slice(0, 60);
  }, [register, existingSearch, existingZone]);

  const pickExisting = (r: { task: string; zoneId: string | null }) => {
    setTask(r.task);
    if (r.zoneId) setZone(r.zoneId);
    setStep(2);
  };

  const save = async () => {
    if (!storeId || !task.trim()) return;
    try {
      const id = await addAdhoc.mutateAsync({
        storeId,
        date: day,
        task: task.trim(),
        zoneId: zone,
        assignedStaffId: person,
        specificTime: finalTime || null,
        estimatedMinutes: finalMinutes,
        note,
        requiresPhoto: reqPhoto,
        requiresNote: reqNote,
      });
      toast({ title: "Uppgiften är skapad" });
      onOpenChange(false);
      if (id) onCreated?.(id);
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Ny uppgift</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => (s.n < step || task.trim()) && setStep(s.n)}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  step === s.n
                    ? "bg-primary text-primary-foreground"
                    : step > s.n
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {step > s.n ? <Check className="h-4 w-4" /> : s.n}
              </button>
              <span
                className={cn(
                  "hidden text-xs sm:block",
                  step === s.n ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        <div className="min-h-[260px] space-y-4 pt-1">
          {step === 1 && mode === null && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Är det en uppgift som redan finns?</p>
              <button
                type="button"
                onClick={() => setMode("finns")}
                className="w-full rounded-xl border-2 p-4 text-left hover:bg-muted"
              >
                <span className="block text-base font-semibold">Välj en uppgift som finns</span>
                <span className="block text-sm text-muted-foreground">
                  Sök i listan eller välj område på kartan — du ser hur många gånger den gjorts.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("ny")}
                className="w-full rounded-xl border-2 p-4 text-left hover:bg-muted"
              >
                <span className="block text-base font-semibold">Skapa en ny uppgift</span>
                <span className="block text-sm text-muted-foreground">
                  Skriv med egna ord och fyll i var, vem och när.
                </span>
              </button>
            </div>
          )}

          {step === 1 && mode === "finns" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={existingSearch}
                  onChange={(e) => setExistingSearch(e.target.value)}
                  placeholder="Sök uppgift …"
                  autoFocus
                  className="h-12 rounded-full pl-9 text-base"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setExistingZone(null)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    existingZone === null ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
                  )}
                >
                  Alla områden
                </button>
                {areas.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setExistingZone(a.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      existingZone === a.id
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "hover:bg-muted",
                    )}
                  >
                    {a.number}. {a.name}
                  </button>
                ))}
              </div>
              {plan && (zones?.length ?? 0) > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setExistingMap((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    <Map className="h-4 w-4" />
                    {existingMap ? "Stäng kartan" : "Välj område på kartan"}
                  </button>
                  {existingMap && (
                    <ZonePickMap
                      plan={plan}
                      zones={zones ?? []}
                      value={existingZone}
                      onChange={setExistingZone}
                      numberOf={(id) => areas.find((a) => a.id === id)?.number ?? null}
                      onNext={() => setExistingMap(false)}
                    />
                  )}
                </>
              )}
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {existingList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen uppgift matchar.</p>
                ) : (
                  existingList.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => pickExisting(r)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{r.task}</span>
                        <span className="block text-xs text-muted-foreground">
                          {areas.find((a) => a.id === r.zoneId)?.name ?? "Inget område"}
                        </span>
                      </span>
                      <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                        gjord {r.doneTimes} ggr
                      </span>
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => setMode("ny")}
                className="text-sm underline"
              >
                Finns den inte? Skapa en ny uppgift
              </button>
            </div>
          )}

          {step === 1 && mode === "ny" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Vad ska göras?</label>
              <Input
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="T.ex. Rengör fiskdisken"
                autoFocus
                className="h-14 text-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && task.trim()) setStep(2);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Skriv med egna ord. Allt annat kan du fylla i i nästa steg — eller senare.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="flex items-center gap-1 text-sm font-medium">
                  <MapPin className="h-4 w-4" /> Var?
                </p>
                {areas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Butiken har inga områden på kartan ännu — uppgiften läggs utan område.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setZone(null)}
                      className={cn(
                        "rounded-full border px-3 py-2 text-sm",
                        zone === null ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
                      )}
                    >
                      Inget område
                    </button>
                    {areas.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setZone(a.id)}
                        className={cn(
                          "rounded-full border px-3 py-2 text-sm",
                          zone === a.id ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
                        )}
                      >
                        {a.number}. {a.name}
                      </button>
                    ))}
                  </div>
                )}
                {plan && (zones?.length ?? 0) > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPickOnMap((v) => !v)}
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium hover:bg-muted"
                    >
                      <Map className="h-4 w-4" />
                      {pickOnMap ? "Stäng kartan" : "Välj på kartan"}
                    </button>
                    {pickOnMap && (
                      <ZonePickMap
                        plan={plan}
                        zones={zones ?? []}
                        value={zone}
                        onChange={setZone}
                        numberOf={(id) => areas.find((a) => a.id === id)?.number ?? null}
                        onNext={() => {
                          setPickOnMap(false);
                          setTimeout(() => {
                            personRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                            personRef.current?.querySelector("input")?.focus();
                          }, 60);
                        }}
                      />
                    )}
                  </>
                )}
              </div>

              <div ref={personRef} className="space-y-2">
                <p className="flex items-center gap-1 text-sm font-medium">
                  <User className="h-4 w-4" /> Vem ska göra det?
                </p>
                {chosenPerson ? (
                  <div className="flex items-center gap-3 rounded-full border border-primary bg-primary/10 px-3 py-2">
                    <StaffAvatar
                      name={`${chosenPerson.first_name} ${chosenPerson.last_name}`}
                      imageUrl={chosenPerson.profile_image_url}
                      className="h-10 w-10"
                    />
                    <span className="flex-1 truncate text-sm font-semibold">
                      {chosenPerson.first_name} {chosenPerson.last_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPerson(null);
                        setPersonSearch("");
                      }}
                      className="rounded-full px-3 py-1 text-xs font-medium underline"
                    >
                      Byt person
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={personSearch}
                        onChange={(e) => setPersonSearch(e.target.value)}
                        placeholder="Skriv de första bokstäverna i namnet …"
                        className="h-12 rounded-full pl-9 text-base"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && people.length > 0) {
                            e.preventDefault();
                            setPerson(people[0].id);
                            setPersonSearch("");
                          }
                        }}
                      />
                    </div>
                    {personSearch.trim() && (
                      <p className="px-1 text-xs text-muted-foreground">
                        {people.length === 0
                          ? "Ingen med det namnet."
                          : `${people.length} träff${people.length === 1 ? "" : "ar"} – tryck på namnet eller Enter för den första.`}
                      </p>
                    )}
                    <div className="max-h-60 space-y-1 overflow-y-auto">
                      {people.map((s, i) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setPerson(s.id);
                            setPersonSearch("");
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-base",
                            personSearch.trim() && i === 0
                              ? "border-primary bg-primary/10 font-semibold"
                              : "hover:bg-muted",
                          )}
                        >
                          <StaffAvatar
                            name={`${s.first_name} ${s.last_name}`}
                            imageUrl={s.profile_image_url}
                            className="h-10 w-10"
                          />
                          <span className="truncate">
                            {s.first_name} {s.last_name}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPerson(null)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm",
                          person === null ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted",
                        )}
                      >
                        Ingen — vem som helst kan ta den
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="flex items-center gap-1 text-sm font-medium">
                  <Clock className="h-4 w-4" /> När börjar den?
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "now" as const, label: "Nu" },
                    { key: "later" as const, label: "Om 30 min" },
                    { key: "own" as const, label: "Egen tid" },
                  ].map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => {
                        setTimeMode(o.key);
                        if (o.key === "now") setTime(nowTime());
                        if (o.key === "later") setTime(nowTime(30));
                      }}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm",
                        timeMode === o.key
                          ? "border-primary bg-primary/10 font-semibold text-primary"
                          : "hover:bg-muted",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      setTimeMode("own");
                    }}
                    className="h-11 w-32"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Hur lång tid tar den?</p>
                <div className="flex flex-wrap items-center gap-2">
                  {DURATIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMinutes(m);
                        setOwnMinutes("");
                      }}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm",
                        minutes === m ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
                      )}
                    >
                      {m} min
                    </button>
                  ))}
                  <Input
                    inputMode="numeric"
                    value={ownMinutes}
                    onChange={(e) => {
                      setOwnMinutes(e.target.value);
                      setMinutes(null);
                    }}
                    placeholder="Egen"
                    className="h-11 w-24"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setMinutes(null);
                      setOwnMinutes("");
                    }}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm",
                      finalMinutes === null ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
                    )}
                  >
                    Går inte att säga
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Krav för att få bocka av</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={reqPhoto}
                    onChange={(e) => setReqPhoto(e.target.checked)}
                  />
                  Bild krävs
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={reqNote}
                    onChange={(e) => setReqNote(e.target.checked)}
                  />
                  Kommentar krävs
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Anteckning (valfritt)</label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[60px]" />
              </div>

              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                {task.trim() || "Uppgiften"} · {chosenArea ? `${chosenArea.number}. ${chosenArea.name}` : "inget område"} ·{" "}
                {chosenPerson ? `${chosenPerson.first_name} ${chosenPerson.last_name}` : "ingen tilldelad"} · {finalTime}
                {finalMinutes ? ` · ${finalMinutes} min` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="lg"
            className="h-12"
            onClick={() => {
              if (step > 1) return setStep(step - 1);
              if (mode !== null) return setMode(null);
              onOpenChange(false);
            }}
          >
            <ArrowLeft className="mr-1 h-5 w-5" /> {step === 1 && mode === null ? "Avbryt" : "Tillbaka"}
          </Button>
          {step < 3 ? (
            <Button size="lg" className="h-12" onClick={() => setStep(step + 1)} disabled={!task.trim()}>
              Nästa <ArrowRight className="ml-1 h-5 w-5" />
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-12"
              onClick={save}
              disabled={!task.trim() || !storeId || addAdhoc.isPending}
            >
              Skapa uppgift
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
