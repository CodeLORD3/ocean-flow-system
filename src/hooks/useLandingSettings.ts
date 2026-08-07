import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LandingSettings {
  id: string;
  headline: string;
  subheadline: string;
  logo_url: string | null;
  logo_size: number;
  headline_font: string;
  headline_size: number;
  headline_weight: number;
  headline_color: string;
  card_title: string;
  card_subtitle: string;
}

const COLUMNS =
  "id, headline, subheadline, logo_url, logo_size, headline_font, headline_size, headline_weight, headline_color, card_title, card_subtitle";

export function useLandingSettings() {
  const [data, setData] = useState<LandingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase
      .from("landing_settings")
      .select(COLUMNS)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) {
          setData((data as unknown as LandingSettings) ?? null);
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, []);

  const update = async (patch: Partial<Omit<LandingSettings, "id">>) => {
    if (!data) return;
    const { error } = await supabase
      .from("landing_settings")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (!error) setData({ ...data, ...patch });
    return error;
  };

  return { data, loading, update };
}
