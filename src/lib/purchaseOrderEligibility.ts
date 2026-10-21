/** Production retains its existing order selection; purchasing only uses new orders. */
export function isScheduleOrderEligible(status: string | null | undefined, production: boolean): boolean {
  return production ? status !== "Arkiverad" : status === "Ny";
}

export function stockholmDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Today's deliveries remain visible; production and purchased history are unchanged. */
export function isPurchaseDeliveryEligible(deliveryDate: string, production: boolean, today: string): boolean {
  return production || deliveryDate.slice(0, 10) >= today;
}