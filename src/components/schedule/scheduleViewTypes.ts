/**
 * Vydata för schemats vecko- och dagvy. Sidan räknar, komponenterna ritar —
 * ingen komponent här läser databasen.
 */
import type { PlannedShiftRow } from "@/lib/liveStaff";

export type ShiftStatus = "published" | "draft" | "violation" | "open";

export interface ShiftCellItem {
  shift: PlannedShiftRow;
  /** Grundpassets kod eller enhetens monokod under tiden. */
  code: string;
  storeName: string;
  status: ShiftStatus;
  /** Förkortad orsak vid regelbrott, t.ex. "Vila 7 h". */
  violation: string | null;
  costPrel: number | null;
}

export interface AbsenceMark {
  label: string;
  status: string;
}

export interface ActualMark {
  minutes: number;
  ongoing: boolean;
  firstIn: string | null;
  lastOut: string | null;
}

export interface DayCell {
  day: string;
  shifts: ShiftCellItem[];
  absences: AbsenceMark[];
  actual: ActualMark | null;
  plannedMinutes: number;
}

export interface WeekRow {
  staffId: string;
  name: string;
  /** Anställningsform eller hemmaenhet — sekundär rad under namnet. */
  secondary: string;
  avatarUrl: string | null;
  weekMinutes: number;
  /** Avtalstak i minuter, null när graden inte är känd. */
  capMinutes: number | null;
  /** Mertid över avtalstaket, i minuter. */
  extraMinutes: number;
  costPrel: number | null;
  cells: DayCell[];
}

export interface CoverageCell {
  day: string;
  scheduled: number;
  target: number;
}

export interface ComingGoingEvent {
  minutes: number;
  kind: "in" | "out";
  name: string;
  storeCode: string;
  consequence: string | null;
}
