/**
 * Attest & avvikelser (etapp 3 D).
 *
 * Flaggade rader ligger överst i beslutsordning (störst differens först),
 * auto-godkända ligger ihopfällda under en sektionsetikett. Bulk-attest sker
 * med valt underlag (schematid, stämplad tid eller justerad tid) och varje
 * beslut loggas. Periodlåsningen sätter gränsen för löneunderlaget i etapp 5.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Lock, LockOpen, RefreshCw, Loader2 } from "lucide-react";
import {
  DecisionBar,
  DecisionMetric,
  IndustryButton,
  IndustryFrame,
  IndustryInput,
  IndustryRow,
  SectionLabel,
  StatusLabel,
} from "@/components/industry";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStores } from "@/hooks/useStores";
import { useEmployees } from "@/hooks/useEmployees";
import {
  DEVIATION_LABEL,
  useAttestations,
  useAttestationJournal,
  useComputeAttest,
  useDecideAttestations,
  useLockPeriod,
  usePeriodLocks,
  useUnlockPeriod,
  type Attestation,
} from "@/hooks/useAttest";
import { dateKey, formatMinutes, isoWeek, mondayOf, weekDates } from "@/lib/schedule";

type Basis = "schema" | "stamplad" | "justerad";

export default function Attestations() {
  const [storeId, setStoreId] = useState("");
  const [anchor, setAnchor] = useState(dateKey(new Date()));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [basis, setBasis] = useState<Basis>("schema");
  const [adjusted, setAdjusted] = useState<number>(0);
  const [showAuto, setShowAuto] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  // En rad i taget: justerad tid kräver alltid en anteckning i journalen.
  const [adjustFor, setAdjustFor] = useState<string | null>(null);
  const [adjustHours, setAdjustHours] = useState<number>(0);
  const [adjustNote, setAdjustNote] = useState("");

  const week = useMemo(() => weekDates(anchor), [anchor]);
  const period = anchor.slice(0, 7);

  const { data: stores = [] } = useStores();
  const store = stores.find((s) => s.id === storeId);
  const { data: employees = [] } = useEmployees(true);
  const { data: attestations = [], isLoading } = useAttestations(storeId || null, week[0], week[6]);
  const { data: locks = [] } = usePeriodLocks(storeId || null);

  const compute = useComputeAttest();
  const decide = useDecideAttestations();
  const lockPeriod = useLockPeriod();
  const unlockPeriod = useUnlockPeriod();

  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.first_name} ${e.last_name}` : "Okänd";
  };

  const flagged = useMemo(
    () =>
      attestations
        .filter((a) => a.status === "flagged")
        .sort((a, b) => Math.abs(b.computed?.diff_minutes ?? 0) - Math.abs(a.computed?.diff_minutes ?? 0)),
    [attestations],
  );
  const auto = attestations.filter((a) => a.status === "auto_approved");
  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);
  /** Översikt när ingen enhet är vald: veckans oattesterade pass per butik. */
  const perStore = useMemo(() => {
    const limit = dateKey(new Date(Date.now() - 7 * 86400000));
    const map = new Map<string, { store_id: string; count: number; old: number }>();
    for (const a of attestations) {
      if (a.status !== "flagged" || !a.store_id) continue;
      const acc = map.get(a.store_id) ?? { store_id: a.store_id, count: 0, old: 0 };
      acc.count += 1;
      if (a.date < limit) acc.old += 1;
      map.set(a.store_id, acc);
    }
    return [...map.values()].sort((a, b) => b.old - a.old || b.count - a.count);
  }, [attestations]);
  const decided = attestations.filter((a) => a.status === "approved" || a.status === "rejected");

  const activeLock = locks.find((l) => l.period === period && !l.unlocked_at);
  const totalDiff = flagged.reduce((s, a) => s + Math.abs(a.computed?.diff_minutes ?? 0), 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const { data: journal = [] } = useAttestationJournal(attestations.map((a) => a.id));
  const journalByAttestation = useMemo(() => {
    const map = new Map<string, typeof journal>();
    for (const j of journal) {
      const list = map.get(j.attestation_id) ?? [];
      list.push(j);
      map.set(j.attestation_id, list);
    }
    return map;
  }, [journal]);

  /** En-tycks-attest per rad. Justerad tid kräver anteckning som hamnar i journalen. */
  const decideOne = async (a: Attestation, rowBasis: Basis, minutes: number, note?: string) => {
    try {
      await decide.mutateAsync({
        ids: [a.id],
        approve: true,
        basis: rowBasis,
        minutes,
        note: note ?? null,
        minutesBefore: a.computed?.clocked_minutes ?? null,
      });
      setAdjustFor(null);
      setAdjustNote("");
      toast.success(`${nameOf(a.employee_id)} ${a.date} attesterad`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Beslutet kunde inte sparas");
    }
  };


  const row = (a: Attestation, tone: "alert" | "neutral" | "accent") => (
    <IndustryRow key={a.id} edge={tone}>
      <div className="flex flex-wrap items-start gap-3">
        {a.status === "flagged" && (
          <Checkbox
            checked={selected.has(a.id)}
            onCheckedChange={() => toggle(a.id)}
            aria-label={`Välj ${a.date} ${nameOf(a.employee_id)}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="ind-strong text-sm">
            {a.date} · {nameOf(a.employee_id)}
          </p>
          <p className="ind-muted ind-mono text-xs">
            Schema {formatMinutes(a.computed?.scheduled_minutes ?? 0)} · Stämplat{" "}
            {formatMinutes(a.computed?.clocked_minutes ?? 0)} · Differens{" "}
            {formatMinutes(a.computed?.diff_minutes ?? 0)}
            {a.computed?.tolerance_minutes !== undefined ? ` · tolerans ${a.computed.tolerance_minutes} min` : ""}
          </p>
          {!a.shift_id && <p className="ind-muted text-xs">Ingen schemalagd pass — oplanerad tid.</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusLabel
            tone={
              a.status === "flagged"
                ? "alert"
                : a.status === "rejected"
                  ? "alert"
                  : a.status === "approved"
                    ? "ok"
                    : "neutral"
            }
          >
            {a.status === "flagged"
              ? DEVIATION_LABEL[a.deviation_type]
              : a.status === "auto_approved"
                ? "Auto-godkänd"
                : a.status === "approved"
                  ? "Attesterad"
                  : "Avslagen"}
          </StatusLabel>
          {a.approved_minutes !== null && (
            <span className="ind-muted ind-mono text-xs">
              Underlag {formatMinutes(a.approved_minutes)} ({a.basis})
            </span>
          )}
        </div>
      </div>

      {a.status === "flagged" && !activeLock && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <IndustryButton
            variant="primary"
            corners
            disabled={decide.isPending}
            onClick={() => decideOne(a, "stamplad", a.computed?.clocked_minutes ?? 0)}
          >
            Attestera stämplad tid
          </IndustryButton>
          <IndustryButton
            variant="ghost"
            disabled={decide.isPending}
            onClick={() => decideOne(a, "schema", a.computed?.scheduled_minutes ?? 0)}
          >
            Attestera schematid
          </IndustryButton>
          <IndustryButton
            variant="ghost"
            onClick={() => {
              setAdjustFor(adjustFor === a.id ? null : a.id);
              setAdjustHours(Number(((a.computed?.clocked_minutes ?? 0) / 60).toFixed(2)));
              setAdjustNote("");
            }}
          >
            Justera tid
          </IndustryButton>
        </div>
      )}

      {adjustFor === a.id && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <Label className="ind-label">Timmar</Label>
            <IndustryInput
              type="number"
              inputMode="decimal"
              step="0.25"
              value={adjustHours}
              onChange={(e) => setAdjustHours(Number(e.target.value))}
              className="w-28"
            />
          </div>
          <div className="min-w-[220px] flex-1">
            <Label className="ind-label">Anteckning till journalen</Label>
            <IndustryInput
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="Skäl till justeringen"
            />
          </div>
          <IndustryButton
            variant="primary"
            corners
            disabled={!adjustNote.trim() || decide.isPending}
            onClick={() => decideOne(a, "justerad", Math.round(adjustHours * 60), adjustNote)}
          >
            Spara justering
          </IndustryButton>
          <IndustryButton variant="ghost" onClick={() => setAdjustFor(null)}>
            Avbryt
          </IndustryButton>
        </div>
      )}

      {journalByAttestation.get(a.id)?.length ? (
        <div className="mt-2 space-y-1">
          {journalByAttestation.get(a.id)!.map((j) => (
            <p key={j.id} className="ind-muted ind-mono text-xs">
              {new Date(j.created_at).toLocaleString("sv-SE")} · {j.action}
              {j.minutes_after !== null ? ` · ${formatMinutes(j.minutes_after)}` : ""}
              {j.note ? ` · ${j.note}` : ""}
            </p>
          ))}
        </div>
      ) : null}
    </IndustryRow>
  );

  const applyDecision = async (approve: boolean) => {
    if (!selected.size) return;
    const ids = [...selected];
    const minutes =
      basis === "justerad"
        ? Math.round(adjusted * 60)
        : basis === "schema"
          ? null
          : null;
    try {
      if (basis !== "justerad") {
        // Underlaget hämtas per rad ur beräkningen
        for (const id of ids) {
          const a = attestations.find((x) => x.id === id);
          if (!a) continue;
          await decide.mutateAsync({
            ids: [id],
            approve,
            basis,
            minutes:
              basis === "schema" ? (a.computed?.scheduled_minutes ?? 0) : (a.computed?.clocked_minutes ?? 0),
          });
        }
      } else {
        await decide.mutateAsync({ ids, approve, basis, minutes });
      }
      setSelected(new Set());
      toast.success(`${ids.length} rader ${approve ? "attesterade" : "avslagna"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Beslutet kunde inte sparas");
    }
  };

  return (
    <IndustryFrame className="ind-page space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Attest</SectionLabel>
          <h1 className="ind-h1">Vecka {isoWeek(anchor)}</h1>
          <p className="ind-muted text-sm">
            {week[0]} – {week[6]} · period {period}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="ind-input w-56">
              <SelectValue placeholder="Välj enhet" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <IndustryInput
            type="date"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value || dateKey(new Date()))}
            className="w-40"
          />
          <IndustryButton
            variant="ghost"
            onClick={() => {
              const d = mondayOf(anchor);
              d.setDate(d.getDate() - 7);
              setAnchor(dateKey(d));
            }}
          >
            Förra veckan
          </IndustryButton>
        </div>
      </div>

      {!storeId ? (
        <section className="space-y-2">
          <SectionLabel>Veckans oattesterade pass per butik</SectionLabel>
          {perStore.length === 0 ? (
            <IndustryRow edge="accent">
              <p className="ind-muted text-sm">
                {isLoading ? "Läser attestunderlaget…" : "Inga oattesterade pass i veckan."}
              </p>
            </IndustryRow>
          ) : (
            perStore.map((s) => (
              <IndustryRow key={s.store_id} edge={s.old > 0 ? "strong" : "alert"}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-[200px]">{storeName.get(s.store_id) ?? "Okänd enhet"}</span>
                  <StatusLabel tone="alert">{s.count} oattesterade</StatusLabel>
                  {s.old > 0 && <StatusLabel tone="progress">{s.old} äldre än 7 dagar</StatusLabel>}
                  <IndustryButton className="ml-auto" variant="ghost" onClick={() => setStoreId(s.store_id)}>
                    Attestera
                  </IndustryButton>
                </div>
              </IndustryRow>
            ))
          )}
        </section>
      ) : (
        <>
          <DecisionBar>
            <DecisionMetric label="Flaggade" value={flagged.length} tone={flagged.length ? "alert" : "ok"} />
            <DecisionMetric label="Summa differens" value={formatMinutes(totalDiff)} />
            <DecisionMetric label="Auto-godkända" value={auto.length} tone="ok" />
            <DecisionMetric label="Beslutade" value={decided.length} />
            <DecisionMetric
              label="Period"
              value={activeLock ? "Låst" : "Öppen"}
              tone={activeLock ? "neutral" : "progress"}
            />
            <IndustryButton
              disabled={compute.isPending}
              onClick={async () => {
                try {
                  await compute.mutateAsync({ storeId, from: week[0], to: week[6] });
                  toast.success("Attestunderlaget beräknat");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Beräkningen misslyckades");
                }
              }}
            >
              {compute.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Beräkna veckan
            </IndustryButton>
          </DecisionBar>

          {activeLock && (
            <IndustryRow edge="strong">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  <StatusLabel tone="neutral">Låst period</StatusLabel> {period} låstes{" "}
                  {new Date(activeLock.locked_at).toLocaleString("sv-SE")}. Underlaget är läsbart men oföränderligt.
                </p>
                <div className="flex items-center gap-2">
                  <IndustryInput
                    placeholder="Skäl för upplåsning"
                    value={unlockReason}
                    onChange={(e) => setUnlockReason(e.target.value)}
                    className="w-56"
                  />
                  <IndustryButton
                    variant="secondary"
                    disabled={!unlockReason.trim()}
                    onClick={async () => {
                      try {
                        await unlockPeriod.mutateAsync({ id: activeLock.id, reason: unlockReason.trim() });
                        setUnlockReason("");
                        toast.success("Perioden upplåst — åtgärden är loggad");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Endast admin kan låsa upp");
                      }
                    }}
                  >
                    <LockOpen className="h-4 w-4" /> Lås upp
                  </IndustryButton>
                </div>
              </div>
            </IndustryRow>
          )}

          {selected.size > 0 && !activeLock && (
            <IndustryRow edge="accent">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="ind-label">Underlag</Label>
                  <Select value={basis} onValueChange={(v) => setBasis(v as Basis)}>
                    <SelectTrigger className="ind-input w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="schema">Schematid</SelectItem>
                      <SelectItem value="stamplad">Stämplad tid</SelectItem>
                      <SelectItem value="justerad">Justerad tid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {basis === "justerad" && (
                  <div>
                    <Label className="ind-label">Timmar</Label>
                    <IndustryInput
                      type="number"
                      inputMode="decimal"
                      step="0.25"
                      value={adjusted}
                      onChange={(e) => setAdjusted(Number(e.target.value))}
                      className="w-28"
                    />
                  </div>
                )}
                <IndustryButton variant="primary" corners disabled={decide.isPending} onClick={() => applyDecision(true)}>
                  Attestera {selected.size}
                </IndustryButton>
                <IndustryButton variant="ghost" onClick={() => applyDecision(false)}>
                  Avslå {selected.size}
                </IndustryButton>
                <IndustryButton variant="ghost" onClick={() => setSelected(new Set())}>
                  Avmarkera
                </IndustryButton>
              </div>
            </IndustryRow>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionLabel>Flaggade avvikelser</SectionLabel>
              {flagged.length > 0 && (
                <IndustryButton
                  variant="ghost"
                  onClick={() => setSelected(new Set(flagged.map((a) => a.id)))}
                >
                  Markera alla
                </IndustryButton>
              )}
            </div>
            {flagged.length ? (
              flagged.map((a) => row(a, "alert"))
            ) : (
              <IndustryRow edge="neutral">
                <p className="ind-muted text-sm">
                  {isLoading ? "Läser attestunderlaget…" : "Inga flaggade avvikelser i veckan."}
                </p>
              </IndustryRow>
            )}
          </section>

          <section className="space-y-2">
            <button
              type="button"
              className="ind-btn ind-btn--ghost"
              onClick={() => setShowAuto((v) => !v)}
              aria-expanded={showAuto}
            >
              {showAuto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Auto-godkända inom tolerans ({auto.length})
            </button>
            {showAuto && auto.map((a) => row(a, "neutral"))}
          </section>

          {decided.length > 0 && (
            <section className="space-y-2">
              <SectionLabel>Beslutade</SectionLabel>
              {decided.map((a) => row(a, "accent"))}
            </section>
          )}

          <section className="space-y-2">
            <SectionLabel>Periodlåsning</SectionLabel>
            <IndustryRow edge={activeLock ? "strong" : flagged.length ? "alert" : "accent"}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  {activeLock
                    ? `Perioden ${period} är låst.`
                    : flagged.length
                      ? `${flagged.length} flaggade rader återstår i veckan — attestera dem innan låsning.`
                      : `Alla veckans rader är hanterade. Perioden ${period} kan låsas.`}
                </p>
                {!activeLock && (
                  <IndustryButton
                    variant="primary"
                    corners
                    disabled={Boolean(flagged.length) || lockPeriod.isPending}
                    onClick={async () => {
                      try {
                        await lockPeriod.mutateAsync({
                          storeId,
                          legalEntityId: store?.legal_entity_id ?? null,
                          period,
                        });
                        toast.success(`Perioden ${period} är låst`);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Kunde inte låsa perioden");
                      }
                    }}
                  >
                    <Lock className="h-4 w-4" /> Lås period
                  </IndustryButton>
                )}
              </div>
            </IndustryRow>
          </section>
        </>
      )}
    </IndustryFrame>
  );
}
