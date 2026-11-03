/** Orsak i klartext för mejl som inte kunde läsas in automatiskt. */
export const MAIL_FAILURE_REASONS: Record<string, string> = {
  for_stort: "Mejlet är för stort för att läsas in automatiskt",
  okant_format: "Bilagan har ett format som inte kan läsas (ingen PDF eller bild)",
  utan_bilaga: "Mejlet har ingen bilaga",
  tolkning_misslyckades: "Bilagan sparades men kunde inte tolkas",
  server_svarade_inte: "Mejlservern svarade inte",
  avbruten: "Inläsningen avbröts innan den blev klar",
};

export function mailFailureReasonText(reason: string): string {
  return MAIL_FAILURE_REASONS[reason] ?? "Okänd orsak";
}
