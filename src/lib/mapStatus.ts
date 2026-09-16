import type { MapTask } from "@/hooks/useStoreMap";

/**
 * Status på kartan beräknas alltid ur riktig ERP-data (uppgifter och
 * avvikelser). Det finns medvetet inget eget statusfält att hålla i synk.
 */
export type MapStatus = "green" | "amber" | "red" | "blue" | "purple" | "grey";

export const STATUS_COLOR: Record<MapStatus, string> = {
  green: "hsl(var(--success))",
  amber: "hsl(var(--warning))",
  red: "hsl(var(--destructive))",
  blue: "hsl(var(--primary))",
  purple: "hsl(268 40% 55%)",
  grey: "hsl(var(--muted-foreground))",
};

export const STATUS_LABEL: Record<MapStatus, string> = {
  green: "Klart",
  amber: "Återstår",
  red: "Problem",
  blue: "Vald",
  purple: "Kommande",
  grey: "Ingen aktivitet",
};

/** Minuter kvar till en tidsangivelse som "18:00". Null om ingen tid finns. */
function minutesUntil(timeLabel: string | null): number | null {
  if (!timeLabel) return null;
  const m = timeLabel.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const now = new Date();
  const target = new Date(now);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

export type MapProgress = {
  total: number;
  done: number;
  percent: number;
  status: MapStatus;
  openIssues: number;
  overdue: number;
};

export function progressFor(tasks: MapTask[], openIssues = 0): MapProgress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const overdue = tasks.filter((t) => {
    if (t.done) return false;
    const left = minutesUntil(t.time_label);
    return left !== null && left < 0;
  }).length;

  let status: MapStatus = "grey";
  if (openIssues > 0 || overdue > 0) status = "red";
  else if (total === 0) status = "grey";
  else if (done === total) status = "green";
  else if (done === 0 && tasks.every((t) => (minutesUntil(t.time_label) ?? 0) > 120)) status = "purple";
  else status = "amber";

  return { total, done, percent, status, openIssues, overdue };
}

/** Rensar bort tid som redan passerat och ger en läsbar text. */
export function dueText(timeLabel: string | null, done: boolean) {
  if (done) return null;
  if (!timeLabel) return null;
  const left = minutesUntil(timeLabel);
  if (left === null) return `Före ${timeLabel}`;
  if (left < 0) return `Försenad sedan ${timeLabel}`;
  if (left < 60) return `Före ${timeLabel} (${left} min kvar)`;
  return `Före ${timeLabel}`;
}
