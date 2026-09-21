import { useEffect, useState } from "react";

/** Stor klocka som räknar sekunder medan uppgiften pågår. */
export function TaskLiveTimer({
  startedAt,
  running,
  pausedMinutes,
}: {
  startedAt?: string | null;
  running: boolean;
  pausedMinutes?: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  if (!startedAt) return null;
  const total = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const paused = Math.max(0, Math.round((pausedMinutes ?? 0) * 60));
  const active = Math.max(0, total - paused);
  const h = Math.floor(active / 3600);
  const m = Math.floor((active % 3600) / 60);
  const s = active % 60;
  const text = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {running ? "Tid på uppgiften" : "Pausad — tiden står still"}
      </p>
      <p className="font-mono text-5xl font-bold tabular-nums leading-tight">{text}</p>
    </div>
  );
}
