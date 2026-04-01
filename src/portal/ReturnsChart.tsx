import { useMemo } from "react";
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

interface Props {
  pledges: any[];
  companyMap: Record<string, any>;
}

export default function ReturnsChart({ pledges, companyMap }: Props) {
  const chartData = useMemo(() => {
    if (!pledges.length) return [];

    const now = new Date();
    const events: { date: Date; realized: number; projected: number; label: string }[] = [];

    // Collect all payout events (paid out = realized, active/matured = projected)
    const paidOut = pledges.filter((p: any) => ["Paid Out", "Repaid"].includes(p.status));
    const active = pledges.filter((p: any) => ["Active", "Matured"].includes(p.status));

    // Build timeline from earliest pledge to latest maturity + buffer
    const allDates: Date[] = [];
    pledges.forEach((p: any) => {
      if (p.created_at) allDates.push(parseISO(p.created_at));
      if (p.trade_offers?.maturity_date) allDates.push(parseISO(p.trade_offers.maturity_date));
    });

    if (!allDates.length) return [];

    const earliest = startOfMonth(new Date(Math.min(...allDates.map((d) => d.getTime()))));
    const latest = addMonths(new Date(Math.max(...allDates.map((d) => d.getTime()))), 1);

    // Generate monthly data points
    const months: Date[] = [];
    let cursor = earliest;
    while (isBefore(cursor, latest) || cursor.getTime() === latest.getTime()) {
      months.push(new Date(cursor));
      cursor = addMonths(cursor, 1);
      if (months.length > 60) break; // safety
    }

    // For each month, calculate cumulative realized profit and projected profit
    return months.map((month) => {
      let realized = 0;
      let projected = 0;

      paidOut.forEach((p: any) => {
        const maturity = p.trade_offers?.maturity_date ? parseISO(p.trade_offers.maturity_date) : null;
        if (maturity && !isAfter(maturity, month)) {
          const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
          realized += Number(p.amount) * (rate / 100);
        }
      });

      active.forEach((p: any) => {
        const maturity = p.trade_offers?.maturity_date ? parseISO(p.trade_offers.maturity_date) : null;
        if (maturity && !isAfter(maturity, month)) {
          const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
          projected += Number(p.amount) * (rate / 100);
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
  }, [pledges, companyMap]);

  if (!chartData.length) return null;

  // Find where projected starts (first non-null projected value)
  const hasProjected = chartData.some((d) => d.projected !== null);
  const hasRealized = chartData.some((d) => d.realized > 0);

  if (!hasRealized && !hasProjected) return null;

  return (
    <div className="border border-border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-semibold text-foreground">Cumulative Returns</h3>
          <p className="text-[10px] text-muted-foreground">Past profit earned and expected future returns</p>
        </div>
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
                `${value.toLocaleString()}`,
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
