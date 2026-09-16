import * as Icons from "lucide-react";
import { Box } from "lucide-react";

/**
 * Samma ikonbibliotek som resten av systemet (Lucide). Objekttypen anger
 * ikonnamnet i databasen, så biblioteket kan utökas utan kodändring.
 */
export function MapObjectIcon({
  icon,
  className,
  size,
}: {
  icon?: string | null;
  className?: string;
  size?: number;
}) {
  const Cmp = (icon && (Icons as unknown as Record<string, typeof Box>)[icon]) || Box;
  return <Cmp className={className} size={size} />;
}
