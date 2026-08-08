import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  /** Kort rubrik som säger vad som saknas. */
  title: string;
  /** En rad som förklarar varför det är tomt och vad som händer härnäst. */
  description: string;
  /** Text på åtgärdsknappen. */
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  /** Kompakt variant utan kortram, för användning inuti tabeller och paneler. */
  bare?: boolean;
}

/**
 * Enhetligt tomt tillstånd: säger vad som saknas, varför, och vad man gör härnäst.
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  bare = false,
}: EmptyStateProps) {
  const body = (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <div className="rounded-full bg-muted p-2 text-muted-foreground">
        {icon ?? <Inbox className="h-4 w-4" />}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" className="mt-1 h-8 text-xs" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );

  if (bare) return body;

  return (
    <Card className="shadow-card">
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  );
}

export default EmptyState;
