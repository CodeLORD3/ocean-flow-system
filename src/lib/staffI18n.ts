/**
 * Personalens översättningar. Språket följer den inloggade personen
 * (staff.preferred_lang); saknas en text visas svenska.
 */
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import reporting from "@/lib/staffDicts/reporting";
import tillverkning from "@/lib/staffDicts/tillverkning";
import produktionslista from "@/lib/staffDicts/produktionslista";
import meny from "@/lib/staffDicts/meny";

export type StaffLang = "sv" | "ti" | "en" | "ar";
export const STAFF_LANGS: { value: StaffLang; label: string }[] = [
  { value: "sv", label: "Svenska" },
  { value: "ti", label: "ትግርኛ (Tigrinja)" },
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
];

export type Row = Partial<Record<StaffLang, string>> & { sv: string };

const DICT: Record<string, Row> = {
  my_time: { sv: "Min tid", ti: "ናተይ ሰዓት", en: "My time", ar: "وقتي" },
  my_time_intro: { sv: "Samma timmar och frånvaro som ligger till grund för din lön.", ti: "ደሞዝካ ዝሰላሰለሉ ሰዓታትን ዘይምህላውን።", en: "The same hours and absence your pay is based on.", ar: "نفس الساعات والغياب التي يُحسب عليها راتبك." },
  pay_period: { sv: "Löneperiod", ti: "እዋን ደሞዝ", en: "Pay period", ar: "فترة الراتب" },
  paid_25: { sv: "Lön utbetalas 25:e", ti: "ደሞዝ ብ25 ይኽፈል", en: "Paid on the 25th", ar: "يُدفع الراتب يوم 25" },
  prev_period: { sv: "Föregående löneperiod", ti: "ዝሓለፈ እዋን ደሞዝ", en: "Previous pay period", ar: "الفترة السابقة" },
  next_period: { sv: "Nästa löneperiod", ti: "ዝቕጽል እዋን ደሞዝ", en: "Next pay period", ar: "الفترة التالية" },
  worked: { sv: "Arbetad tid", ti: "ዝሰራሕካዮ ሰዓት", en: "Worked time", ar: "وقت العمل" },
  of_which_ob: { sv: "Varav OB", ti: "ካብኡ OB", en: "Of which OB", ar: "منها OB" },
  absence_days: { sv: "Frånvarodagar", ti: "መዓልታት ዘይምህላው", en: "Absence days", ar: "أيام الغياب" },
  not_done_days: { sv: "Ej klara dagar", ti: "ዘይተወድኡ መዓልታት", en: "Days not finished", ar: "أيام غير مكتملة" },
  day_by_day: { sv: "Dag för dag", ti: "መዓልቲ ብመዓልቲ", en: "Day by day", ar: "يوماً بيوم" },
  load_error: { sv: "Kunde inte hämta dina tider. Försök igen.", ti: "ሰዓታትካ ክመጽእ ኣይከኣለን። ደጊምካ ፈትን።", en: "Could not load your times. Try again.", ar: "تعذر تحميل أوقاتك. حاول مرة أخرى." },
  no_time: { sv: "Ingen registrerad tid i perioden.", ti: "ኣብዚ እዋን ዝተመዝገበ ሰዓት የለን።", en: "No time registered in this period.", ar: "لا يوجد وقت مسجل في هذه الفترة." },
  missing: { sv: "saknas", ti: "የለን", en: "missing", ar: "مفقود" },
  break: { sv: "Rast", ti: "ዕረፍቲ", en: "Break", ar: "استراحة" },
  absence: { sv: "Frånvaro", ti: "ዘይምህላው", en: "Absence", ar: "غياب" },
  attested: { sv: "Attesterad", ti: "ጸዲቑ", en: "Approved", ar: "معتمد" },
  in_review: { sv: "Granskas", ti: "ይምርመር ኣሎ", en: "In review", ar: "قيد المراجعة" },
  rejected: { sv: "Avslagen", ti: "ተነጺጉ", en: "Rejected", ar: "مرفوض" },
  not_attested: { sv: "Ej attesterad", ti: "ገና ኣይጸደቐን", en: "Not approved", ar: "غير معتمد" },
  language: { sv: "Språk", ti: "ቋንቋ", en: "Language", ar: "اللغة" },
  lang_saved: { sv: "Språket är sparat", ti: "ቋንቋ ተዓቂቡ", en: "Language saved", ar: "تم حفظ اللغة" },
  lang_error: { sv: "Kunde inte spara språket", ti: "ቋንቋ ክዕቀብ ኣይከኣለን", en: "Could not save language", ar: "تعذر حفظ اللغة" },
};

export function normalizeLang(v: string | null | undefined): StaffLang {
  return v === "ti" || v === "en" || v === "ar" ? v : "sv";
}

export function staffT(key: string, lang: StaffLang): string {
  const row = DICT[key] ?? reporting[key] ?? tillverkning[key] ?? produktionslista[key] ?? meny[key];
  if (!row) return key;
  return row[lang] ?? row.sv;
}

/** Text på den inloggade personens språk. */
export function useStaffT() {
  const { staff } = useStaffAuth();
  const lang = normalizeLang(staff?.preferred_lang);
  return { lang, t: (key: string) => staffT(key, lang), dir: lang === "ar" ? "rtl" as const : "ltr" as const };
}
