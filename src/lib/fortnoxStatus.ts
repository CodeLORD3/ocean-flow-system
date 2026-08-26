/** Statusetiketter för Fortnox-fakturajobb. Bokföring och utskick sker manuellt i Fortnox. */
export const FORTNOX_JOB_STATUS_LABEL: Record<string, string> = {
  pending: "Väntar",
  creating: "Skapar i Fortnox",
  created: "Utkast i Fortnox – bokför och skicka i Fortnox",
  bookkept: "Bokförd i Fortnox",
  sent: "Skickad till kund",
  paid: "Betald",
  cancelled: "Annullerad",
  failed: "Misslyckades",
};

export function fortnoxJobStatusLabel(status?: string | null): string {
  return FORTNOX_JOB_STATUS_LABEL[status ?? ""] ?? (status ?? "—");
}

/** Bekräftelsetext efter lyckad sändning. */
export function fortnoxDraftCreatedText(documentNumber: string | number): string {
  return `Utkast skapat i Fortnox som faktura nr ${documentNumber}. Bokför och skicka i Fortnox.`;
}
