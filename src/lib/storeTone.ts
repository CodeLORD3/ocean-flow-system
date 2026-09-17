/**
 * Stabil färgton per butik så samma butik alltid känns igen i listorna.
 * Tonen väljs av butiks-id, inte av ordningen i listan.
 */
export type StoreTone = {
  border: string;
  dot: string;
  ring: string;
  badge: string;
  hover: string;
  icon: string;
};

const TONES: StoreTone[] = [
  { border: "border-l-sky-300", dot: "bg-sky-400", ring: "ring-sky-100", badge: "bg-sky-50 text-sky-700", hover: "group-hover:bg-sky-50/60 group-hover:border-sky-200", icon: "group-hover:text-sky-600" },
  { border: "border-l-rose-300", dot: "bg-rose-400", ring: "ring-rose-100", badge: "bg-rose-50 text-rose-700", hover: "group-hover:bg-rose-50/60 group-hover:border-rose-200", icon: "group-hover:text-rose-600" },
  { border: "border-l-amber-300", dot: "bg-amber-400", ring: "ring-amber-100", badge: "bg-amber-50 text-amber-700", hover: "group-hover:bg-amber-50/60 group-hover:border-amber-200", icon: "group-hover:text-amber-600" },
  { border: "border-l-emerald-300", dot: "bg-emerald-400", ring: "ring-emerald-100", badge: "bg-emerald-50 text-emerald-700", hover: "group-hover:bg-emerald-50/60 group-hover:border-emerald-200", icon: "group-hover:text-emerald-600" },
  { border: "border-l-violet-300", dot: "bg-violet-400", ring: "ring-violet-100", badge: "bg-violet-50 text-violet-700", hover: "group-hover:bg-violet-50/60 group-hover:border-violet-200", icon: "group-hover:text-violet-600" },
  { border: "border-l-teal-300", dot: "bg-teal-400", ring: "ring-teal-100", badge: "bg-teal-50 text-teal-700", hover: "group-hover:bg-teal-50/60 group-hover:border-teal-200", icon: "group-hover:text-teal-600" },
  { border: "border-l-slate-300", dot: "bg-slate-400", ring: "ring-slate-100", badge: "bg-slate-50 text-slate-600", hover: "group-hover:bg-slate-50 group-hover:border-slate-200", icon: "group-hover:text-slate-600" },
];

export function storeTone(id: string | null | undefined): StoreTone {
  if (!id) return TONES[TONES.length - 1];
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i) * (i + 1)) % 100000;
  return TONES[sum % TONES.length];
}
