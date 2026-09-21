/**
 * Händelsetyper på en persons egen sida. Endast presentation: ikon, etikett
 * och vart raden leder. Ingen datahämtning här.
 */
import {
  CheckCircle2, ClipboardList, Image as ImageIcon, MessageSquare, Eye,
  LogIn, LogOut, Scissors, Tag, Activity,
} from "lucide-react";

export type PersonEventKind =
  | "task_done"
  | "task_assigned"
  | "image_uploaded"
  | "image_edited"
  | "image_activity"
  | "image_comment"
  | "observation"
  | "clock_in"
  | "clock_out"
  | "system";

export interface PersonEvent {
  id: string;
  /** ISO-tid, sorteras fallande. */
  at: string;
  kind: PersonEventKind;
  title: string;
  meta?: string | null;
  /** Rutt att gå till, redan komplett med frågesträng. */
  route?: string | null;
}

const ICONS: Record<PersonEventKind, any> = {
  task_done: CheckCircle2,
  task_assigned: ClipboardList,
  image_uploaded: ImageIcon,
  image_edited: Tag,
  image_activity: Scissors,
  image_comment: MessageSquare,
  observation: Eye,
  clock_in: LogIn,
  clock_out: LogOut,
  system: Activity,
};

const LABELS: Record<PersonEventKind, string> = {
  task_done: "Uppgift",
  task_assigned: "Tilldelad",
  image_uploaded: "Bild",
  image_edited: "Bild",
  image_activity: "Bild",
  image_comment: "Kommentar",
  observation: "Iakttagelse",
  clock_in: "Stämplade in",
  clock_out: "Stämplade ut",
  system: "Systemändring",
};

export function eventIcon(kind: PersonEventKind) {
  return ICONS[kind] ?? Activity;
}

export function eventLabel(kind: PersonEventKind): string {
  return LABELS[kind] ?? "Händelse";
}

/** Klockslag, svensk tid. */
export function eventTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

export const taskRoute = (id: string) => `/uppgift/${id}`;
export const imageRoute = (id: string) => `/image-feed?bild=${id}`;
