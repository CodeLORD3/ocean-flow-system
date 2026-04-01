import { useMemo, useState } from "react";
import { parseISO, format, addMonths, isAfter, isBefore, startOfMonth } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { getCurrency } from "@/lib/currency";

// Indicative cross rates (static, good enough for display)
const FX_RATES: Record<string, Record<string, number>> = {
  SEK: { SEK: 1, CHF: 0.085, EUR: 0.088, USD: 0.095 },
  CHF: { CHF: 1, SEK: 11.8, EUR: 1.04, USD: 1.12 },
  EUR: { EUR: 1, SEK: 11.35, CHF: 0.96, USD: 1.08 },
  USD: { USD: 1, SEK: 10.5, CHF: 0.89, EUR: 0.93 },
};

function convert(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const rate = FX_RATES[from]?.[to] ?? 1;
  return amount * rate;
}

interface Props {
  pledges: any[];
  companyMap: Record<string, any>;
  baseCurrency?: string;
}

export default function ReturnsChart({ pledges, companyMap, baseCurrency = "SEK" }: Props) {
  const [displayCurrency, setDisplayCurrency] = useState<string>(baseCurrency);

  const chartData = useMemo(() => {
    if (!pledges.length) return [];

    const now = new Date();

    const paidOut = pledges.filter((p: any) => ["Paid Out", "Repaid"].includes(p.status));
    const active = pledges.filter((p: any) => ["Active", "Matured", "Pending Payment"].includes(p.status));

    const allDates: Date[] = [];
    pledges.forEach((p: any) => {
      if (p.created_at) allDates.push(parseISO(p.created_at));
      if (p.trade_offers?.maturity_date) allDates.push(parseISO(p.trade_offers.maturity_date));
    });

    if (!allDates.length) return [];

    const earliest = startOfMonth(new Date(Math.min(...allDates.map((d) => d.getTime()))));
    const latest = addMonths(new Date(Math.max(...allDates.map((d) => d.getTime()))), 1);

    const months: Date[] = [];
    let cursor = earliest;
    while (isBefore(cursor, latest) || cursor.getTime() === latest.getTime()) {
      months.push(new Date(cursor));
      cursor = addMonths(cursor, 1);
      if (months.length > 60) break;
    }

    const getPledgeCurrency = (p: any) => {
      const offer = p.trade_offers;
      const company = offer?.company_id ? companyMap[offer.company_id] : null;
      return getCurrency(company?.country);
    };

    return months.map((month) => {
      let realized = 0;
      let projected = 0;

      paidOut.forEach((p: any) => {
        const maturity = p.trade_offers?.maturity_date ? parseISO(p.trade_offers.maturity_date) : null;
        if (maturity && !isAfter(maturity, month)) {
          const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
          const profit = Number(p.amount) * (rate / 100);
          const cur = getPledgeCurrency(p);
          realized += convert(profit, cur, displayCurrency);
        }
      });

      active.forEach((p: any) => {
        const maturity = p.trade_offers?.maturity_date ? parseISO(p.trade_offers.maturity_date) : null;
        if (maturity && !isAfter(maturity, month)) {
          const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
          const profit = Number(p.amount) * (rate / 100);
          const cur = getPledgeCurrency(p);
          projected += convert(profit, cur, displayCurrency);
        }
      });

      const isPast = !isAfter(month, now);

      return {
        month: format(month, "MMM yyyy"),
        realized: Math.round(realized),
        projected: isPast ? null : Math.round(realized + projected),
        total: Math.round(realized + projected),
      };
    });
  }, [pledges, companyMap, displayCurrency]);

  if (!chartData.length) return null;

  const hasProjected = chartData.some((d) => d.projected !== null);
  const hasRealized = chartData.some((d) => d.realized > 0);

  if (!hasRealized && !hasProjected) return null;

  const currencies = ["SEK", "CHF", "EUR", "USD"];

  return (
    <div className="border border-border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-semibold text-foreground">Cumulative Returns</h3>
          <p className="text-[10px] text-muted-foreground">Past profit earned and expected future returns</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Currency switcher */}
          <select
            value={displayCurrency}
            onChange={(e) => setDisplayCurrency(e.target.value)}
            className="h-6 px-1.5 text-[10px] border border-border rounded bg-white text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="h-2 w-4 bg-primary rounded-sm inline-block" />
              Realized
            </span>
            {hasProjected && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-4 rounded-sm inline-block border border-dashed border-mackerel bg-mackerel/20" />
                Expected
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              width={40}
            />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 4,
              }}
              formatter={(value: number, name: string) => [
                `${value.toLocaleString()} ${displayCurrency}`,
                name === "realized" ? "Realized Profit" : "Expected Profit",
              ]}
            />
            <Area
              type="monotone"
              dataKey="realized"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary))"
              fillOpacity={0.15}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            {hasProjected && (
              <Area
                type="monotone"
                dataKey="projected"
                stroke="hsl(var(--mackerel))"
                fill="hsl(var(--mackerel))"
                fillOpacity={0.08}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
