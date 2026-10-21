/** Production retains its existing order selection; purchasing only uses new orders. */
export function isScheduleOrderEligible(status: string | null | undefined, production: boolean): boolean {
  return production ? status !== "Arkiverad" : status === "Ny";
}