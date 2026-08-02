/** Var i bilden som ska visas när den beskärs (object-position). */
export type FocalPoint = "top" | "center" | "bottom";

export const FOCAL_OPTIONS: { value: FocalPoint; label: string }[] = [
  { value: "top", label: "Överkant" },
  { value: "center", label: "Mitten" },
  { value: "bottom", label: "Nederkant" },
];

/** Tailwind-klass för object-position utifrån sparad fokuspunkt. */
export function focalClass(focal?: string | null): string {
  switch (focal) {
    case "top":
      return "object-top";
    case "bottom":
      return "object-bottom";
    default:
      return "object-center";
  }
}

export function nextFocal(focal?: string | null): FocalPoint {
  const order: FocalPoint[] = ["top", "center", "bottom"];
  const idx = order.indexOf((focal as FocalPoint) || "center");
  return order[(idx + 1) % order.length];
}
