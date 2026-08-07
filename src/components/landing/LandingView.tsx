import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LandingSettings } from "@/hooks/useLandingSettings";
import logoAsset from "@/assets/fiskskaldjur-logo.png.asset.json";

export const HEADLINE_FONTS = [
  { value: "heading", label: "Space Grotesk", className: "font-heading" },
  { value: "body", label: "DM Sans", className: "font-body" },
  { value: "serif", label: "Serif", className: "font-serif" },
  { value: "mono", label: "Monospace", className: "font-mono" },
];

export const HEADLINE_COLORS = [
  { value: "foreground", label: "Standard", className: "text-foreground" },
  { value: "primary", label: "Primär", className: "text-primary" },
  { value: "muted-foreground", label: "Dämpad", className: "text-muted-foreground" },
  { value: "destructive", label: "Accent (röd)", className: "text-destructive" },
];

export const HEADLINE_WEIGHTS = [
  { value: 400, label: "Normal" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Halvfet" },
  { value: 700, label: "Fet" },
  { value: 800, label: "Extra fet" },
];

export function fontClass(v?: string) {
  return HEADLINE_FONTS.find((f) => f.value === v)?.className ?? "font-heading";
}

export function colorClass(v?: string) {
  return HEADLINE_COLORS.find((c) => c.value === v)?.className ?? "text-foreground";
}

export function landingLogoUrl(settings?: Partial<LandingSettings> | null) {
  return settings?.logo_url || logoAsset.url;
}

interface LandingViewProps {
  settings: Partial<LandingSettings> | null;
  /** Scales all typography/spacing, used for the inline preview */
  scale?: number;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function LandingView({ settings, scale = 1, children, footer, className }: LandingViewProps) {
  const headline = settings?.headline ?? "Välkommen till Makrill Trade";
  const subheadline = settings?.subheadline ?? "";
  const logoSize = (settings?.logo_size ?? 112) * scale;
  const headlineSize = (settings?.headline_size ?? 48) * scale;

  return (
    <div className={cn("flex flex-col items-center bg-background", className)}>
      <img
        src={landingLogoUrl(settings)}
        alt="Logotyp"
        className="object-contain"
        style={{ height: logoSize, width: logoSize, marginBottom: 20 * scale }}
      />
      <h1
        className={cn("text-center max-w-3xl leading-tight", fontClass(settings?.headline_font), colorClass(settings?.headline_color))}
        style={{
          fontSize: headlineSize,
          fontWeight: settings?.headline_weight ?? 700,
          marginBottom: (subheadline ? 10 : 32) * scale,
        }}
      >
        {headline}
      </h1>
      {subheadline && (
        <p
          className="text-center text-muted-foreground max-w-xl"
          style={{ fontSize: Math.max(11, headlineSize * 0.36), marginBottom: 32 * scale }}
        >
          {subheadline}
        </p>
      )}

      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-1 text-foreground">
            {settings?.card_title || "Logga in"}
          </h2>
          <p className="text-xs text-muted-foreground mb-5">
            {settings?.card_subtitle || "Använd din arbets-e-post för att komma åt portalerna."}
          </p>
          {children}
        </CardContent>
      </Card>

      {footer}
    </div>
  );
}
