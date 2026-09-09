import { PackageCheck, Store, Truck } from "lucide-react";
import { ORDER_TYPE_LABELS } from "@/lib/customerOrders";

/**
 * Symbol för orderns leveranssätt.
 * Butik = upphämtning, lastbil = egen leverans, paket = postas med extern
 * transportör (Posten eller annan leveranstjänst).
 */
export function OrderTypeIcon({
  orderType,
  className = "h-3.5 w-3.5",
}: {
  orderType: string;
  className?: string;
}) {
  const label =
    orderType === "postas"
      ? "Postas — extern transportör"
      : orderType === "leverans"
        ? "Hemleverans med butikens bil"
        : "Upphämtning i butik";

  const icon =
    orderType === "postas" ? (
      <PackageCheck className={`${className} text-primary`} aria-hidden />
    ) : orderType === "leverans" ? (
      <Truck className={`${className} text-primary`} aria-hidden />
    ) : (
      <Store className={`${className} text-muted-foreground`} aria-hidden />
    );

  return (
    <span className="inline-flex items-center" title={label} aria-label={label} role="img">
      {icon}
    </span>
  );
}

export const orderTypeLabel = (t: string) =>
  (ORDER_TYPE_LABELS as Record<string, string>)[t] ?? t;
