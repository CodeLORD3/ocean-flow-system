import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEGMENTS } from "@/lib/customerOutreach";

const db = supabase as unknown as { from: (t: string) => any };
const NONE = "__ingen";
const ALLA = "Alla";

async function count(seg: string, col: "consent_email" | "consent_whatsapp") {
  let q = db.from("customers_retail").select("id", { count: "exact", head: true }).eq(col, true).is("anonymized_at", null);
  if (seg !== ALLA) q = q.eq("segment", seg);
  const { count: n, error } = await q;
  if (error) throw error;
  return n as number;
}

export function VeckobrevSegmentPanel({ value, onChange }: { value: string | null; onChange: (seg: string | null) => void }) {
  const c = useQuery({
    queryKey: ["veckobrev-mottagare", value],
    enabled: !!value,
    queryFn: async () => ({ email: await count(value!, "consent_email"), whatsapp: await count(value!, "consent_whatsapp") }),
  });
  return (
    <div className="rounded-md border p-3 space-y-2">
      <Label>Segment för veckobrevet</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Inget valt</SelectItem>
            <SelectItem value={ALLA}>Alla segment</SelectItem>
            {SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {value && (
          <span className="text-sm">
            Mottagare med samtycke: e-post <b className="font-mono tabular-nums">{c.data?.email ?? "…"}</b>
            {" · "}WhatsApp <b className="font-mono tabular-nums">{c.data?.whatsapp ?? "…"}</b>
          </span>
        )}
      </div>
    </div>
  );
}
