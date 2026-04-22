import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LandingSettings {
  id: string;
  headline: string;
}

export function useLandingSettings() {
  const [data, setData] = useState<LandingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase
      .from("landing_settings")
      .select("id, headline")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) {
          setData((data as LandingSettings) ?? null);
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, []);

  const update = async (headline: string) => {
    if (!data) return;
    const { error } = await supabase
      .from("landing_settings")
      .update({ headline, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (!error) setData({ ...data, headline });
    return error;
  };

  return { data, loading, update };
}
