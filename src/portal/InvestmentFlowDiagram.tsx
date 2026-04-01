import { useMemo } from "react";
import { motion } from "framer-motion";
import { parseISO, format, differenceInDays, isAfter, isBefore, isSameDay } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CircleDollarSign, Flag, MapPin, TrendingUp } from "lucide-react";

interface Pledge {
  id: string;
  amount: number;
  created_at: string;
  status: string;
  trade_offers: {
    id: string;
    title: string;
    interest_rate: number;
    maturity_date: string;
    purchase_date: string | null;
    target_amount: number;
    funded_amount: number;
    status: string;
  } | null;
}

interface MergedNode {
  date: Date;
  items: { label: string; amount: number; type: "committed" | "start" | "payout"; offerTitle: string }[];
  type: "committed" | "start" | "current" | "payout" | "mixed";
  status: "completed" | "current" | "upcoming";
  totalAmount: number;
}

export default function InvestmentFlowDiagram({ pledges }: { pledges: Pledge[] }) {
  const activePledges = pledges.filter((p) => p.status === "Active" && p.trade_offers);

  const { milestones, totalInvested, totalPayout, progressPercent, earliestDate, latestDate } = useMemo(() => {
    if (activePledges.length === 0) {
      return { milestones: [], totalInvested: 0, totalPayout: 0, progressPercent: 0, earliestDate: null, latestDate: null };
    }

    const now = new Date();
    const rawNodes: { date: Date; label: string; amount: number; type: "committed" | "start" | "payout"; status: "completed" | "upcoming"; offerTitle: string }[] = [];

    let invested = 0;
    let payout = 0;
    let earliest: Date | null = null;
    let latest: Date | null = null;

    activePledges.forEach((p: any) => {
      const offer = p.trade_offers;
      if (!offer) return;
      const amt = Number(p.amount);
      const rate = Number(offer.interest_rate);
      invested += amt;
      payout += amt * (1 + rate / 100);

      const committedDate = parseISO(p.created_at);
      const startDate = offer.purchase_date ? parseISO(offer.purchase_date) : committedDate;
      const maturityDate = parseISO(offer.maturity_date);

      if (!earliest || isBefore(committedDate, earliest)) earliest = committedDate;
      if (!latest || isAfter(maturityDate, latest)) latest = maturityDate;

      // Committed node (when investor placed the pledge)
      rawNodes.push({
        date: committedDate,
        label: `Committed – ${offer.title}`,
        amount: amt,
        type: "committed",
        status: "completed",
        offerTitle: offer.title,
      });

      // Start node (when the offer's investment period begins)
      if (!isSameDay(startDate, committedDate)) {
        const started = isBefore(startDate, now) || isSameDay(startDate, now);
        rawNodes.push({
          date: startDate,
          label: `Started – ${offer.title}`,
          amount: amt,
          type: "start",
          status: started ? "completed" : "upcoming",
          offerTitle: offer.title,
        });
      }

      const matured = isBefore(maturityDate, now) || differenceInDays(maturityDate, now) <= 0;
      rawNodes.push({
        date: maturityDate,
        label: `Maturity – ${offer.title}`,
        amount: Math.round(amt * (1 + rate / 100)),
        type: "payout",
        status: matured ? "completed" : "upcoming",
        offerTitle: offer.title,
      });
    });

    // Merge nodes on the same day
    const merged: MergedNode[] = [];
    rawNodes.sort((a, b) => a.date.getTime() - b.date.getTime());

    rawNodes.forEach((node) => {
      const existing = merged.find((m) => isSameDay(m.date, node.date));
      if (existing) {
        existing.items.push({ label: node.label, amount: node.amount, type: node.type, offerTitle: node.offerTitle });
        existing.totalAmount += node.amount;
        // If mixed start+payout on same day
        if (existing.type !== node.type) existing.type = "mixed";
        // Status: if any upcoming, mark upcoming
        if (node.status === "upcoming") existing.status = "upcoming";
      } else {
        merged.push({
          date: node.date,
          items: [{ label: node.label, amount: node.amount, type: node.type, offerTitle: node.offerTitle }],
          type: node.type,
          status: node.status,
          totalAmount: node.amount,
        });
      }
    });

    // Calculate progress
    let progress = 0;
    if (earliest && latest) {
      const totalSpan = latest.getTime() - earliest.getTime();
      const elapsed = now.getTime() - earliest.getTime();
      progress = totalSpan > 0 ? Math.min(100, Math.max(0, (elapsed / totalSpan) * 100)) : 0;

      // Add "current" node if between start and end
      if (isAfter(now, earliest) && isBefore(now, latest)) {
        // Don't merge with existing same-day node — check first
        const sameDayExists = merged.find((m) => isSameDay(m.date, now));
        if (!sameDayExists) {
          merged.push({
            date: now,
            items: [],
            type: "current",
            status: "current",
            totalAmount: Math.round(invested + (payout - invested) * (progress / 100)),
          });
        }
      }
    }

    merged.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      milestones: merged,
      totalInvested: invested,
      totalPayout: Math.round(payout),
      progressPercent: progress,
      earliestDate: earliest,
      latestDate: latest,
    };
  }, [activePledges]);

  if (activePledges.length === 0 || !earliestDate || !latestDate) return null;

  const totalSpan = latestDate.getTime() - earliestDate.getTime();

  // Position nodes by actual date, with padding so edge nodes don't clip
  const PAD = 8; // percent padding on each side
  const getLeftPercent = (date: Date) => {
    if (totalSpan <= 0) return 50;
    const ratio = (date.getTime() - earliestDate.getTime()) / totalSpan;
    return PAD + ratio * (100 - 2 * PAD);
  };

  const nodeStyles = {
    completed: { bg: "bg-muted", border: "border-border", text: "text-muted-foreground", icon: "text-muted-foreground" },
    current: { bg: "bg-primary/10", border: "border-primary", text: "text-primary", icon: "text-primary" },
    upcoming: { bg: "bg-accent/10", border: "border-accent", text: "text-accent", icon: "text-accent" },
  };

  const NodeIcon = ({ type }: { type: string }) => {
    switch (type) {
      case "committed": return <CircleDollarSign className="h-2.5 w-2.5" />;
      case "start": return <Flag className="h-2.5 w-2.5" />;
      case "current": return <MapPin className="h-2.5 w-2.5" />;
      case "payout": return <TrendingUp className="h-2.5 w-2.5" />;
      case "mixed": return <Flag className="h-2.5 w-2.5" />;
      default: return <CircleDollarSign className="h-2.5 w-2.5" />;
    }
  };

  return (
    <div className="border border-border bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xs font-bold text-foreground">Investment Lifecycle</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">Timeline from investment to payout</p>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">Completed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">Current</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-muted-foreground">Upcoming</span>
          </div>
        </div>
      </div>

      {/* Growth bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Invested: <span className="font-mono font-bold text-foreground">{totalInvested.toLocaleString()} kr</span></span>
          <span>Expected Payout: <span className="font-mono font-bold text-mackerel">{totalPayout.toLocaleString()} kr</span></span>
        </div>
        <div className="h-3 bg-muted overflow-hidden relative">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-accent"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
          <motion.div
            className="absolute top-0 h-full w-0.5 bg-foreground"
            initial={{ left: 0 }}
            animate={{ left: `${progressPercent}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </div>
        <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5">
          <span>{Math.round(progressPercent)}% elapsed</span>
          <span>+{(totalPayout - totalInvested).toLocaleString()} kr profit</span>
        </div>
      </div>

      {/* Desktop timeline */}
      <TooltipProvider>
        <div className="hidden md:block">
          <div className="relative" style={{ height: "100px" }}>
            {/* Timeline line */}
            <div className="absolute top-[46px] h-px bg-border" style={{ left: `${PAD}%`, right: `${PAD}%` }} />
            {/* Animated progress line */}
            <motion.div
              className="absolute top-[46px] h-px bg-primary"
              style={{ left: `${PAD}%` }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent * (100 - 2 * PAD) / 100}%` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />

            {milestones.map((node, i) => {
              const left = getLeftPercent(node.date);
              const style = nodeStyles[node.status];
              const isAbove = i % 2 === 0;
              const isCurrent = node.type === "current";
              const displayLabel = isCurrent
                ? "NOW"
                : format(node.date, "d MMM yyyy");
              const displayAmount = isCurrent
                ? `~${node.totalAmount.toLocaleString()} kr`
                : node.items.length === 1
                  ? `${node.totalAmount.toLocaleString()} kr`
                  : `${node.items.length}× = ${node.totalAmount.toLocaleString()} kr`;

              return (
                <Tooltip key={`node-${i}`}>
                  <TooltipTrigger asChild>
                    <motion.div
                      className="absolute flex flex-col items-center cursor-default"
                      style={{ left: `${left}%`, transform: "translateX(-50%)", top: isAbove ? 0 : undefined, bottom: isAbove ? undefined : 0 }}
                      initial={{ opacity: 0, y: isAbove ? -8 : 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.2 + i * 0.12 }}
                    >
                      {isAbove ? (
                        <>
                          <div className="text-center mb-1 whitespace-nowrap">
                            <div className={`text-[8px] font-semibold ${style.text} uppercase tracking-wide`}>
                              {displayLabel}
                            </div>
                            <div className="text-[9px] font-mono font-bold text-foreground">{displayAmount}</div>
                          </div>
                          <div className={`h-4 w-4 rounded-full border-2 ${style.border} ${style.bg} flex items-center justify-center ${style.icon} relative z-10`}>
                            <NodeIcon type={node.type} />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={`h-4 w-4 rounded-full border-2 ${style.border} ${style.bg} flex items-center justify-center ${style.icon} relative z-10`}>
                            <NodeIcon type={node.type} />
                          </div>
                          <div className="text-center mt-1 whitespace-nowrap">
                            <div className={`text-[8px] font-semibold ${style.text} uppercase tracking-wide`}>
                              {displayLabel}
                            </div>
                            <div className="text-[9px] font-mono font-bold text-foreground">{displayAmount}</div>
                          </div>
                        </>
                      )}
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent side={isAbove ? "top" : "bottom"} className="text-[10px] max-w-[200px] space-y-1">
                    <p className="font-semibold">{format(node.date, "d MMMM yyyy")}</p>
                    {node.items.length > 0 ? (
                      node.items.map((item, j) => (
                        <div key={j} className="border-t border-border pt-1">
                          <p className="text-muted-foreground">{item.label}</p>
                          <p className="font-mono font-bold">{item.amount.toLocaleString()} kr</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">Current estimated value</p>
                    )}
                    <p className={`text-[9px] font-semibold uppercase ${
                      node.status === "completed" ? "text-muted-foreground" : node.status === "current" ? "text-primary" : "text-accent"
                    }`}>
                      {node.status === "completed" ? "Completed" : node.status === "current" ? "In Progress" : "Upcoming"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Mobile timeline — vertical */}
        <div className="md:hidden space-y-0">
          {milestones.map((node, i) => {
            const style = nodeStyles[node.status];
            const isLast = i === milestones.length - 1;
            const isCurrent = node.type === "current";
            return (
              <Tooltip key={`m-${i}`}>
                <TooltipTrigger asChild>
                  <motion.div
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 + i * 0.1 }}
                  >
                    <div className="flex flex-col items-center">
                      <div className={`h-4 w-4 rounded-full border-2 ${style.border} ${style.bg} flex items-center justify-center ${style.icon} shrink-0 relative z-10`}>
                        <NodeIcon type={node.type} />
                      </div>
                      {!isLast && <div className="w-px h-8 bg-border" />}
                    </div>
                    <div className="pb-3 -mt-0.5">
                      <div className={`text-[10px] font-semibold ${style.text}`}>
                        {isCurrent ? "YOU ARE HERE" : format(node.date, "d MMM yyyy")}
                      </div>
                      {node.items.map((item, j) => (
                        <div key={j} className="text-[9px] text-muted-foreground">{item.label} — <span className="font-mono font-bold text-foreground">{item.amount.toLocaleString()} kr</span></div>
                      ))}
                      {isCurrent && (
                        <div className="text-[9px] text-muted-foreground">Est. value: <span className="font-mono font-bold text-foreground">~{node.totalAmount.toLocaleString()} kr</span></div>
                      )}
                    </div>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-[10px]">
                  <p className={`uppercase text-[9px] font-semibold ${
                    node.status === "completed" ? "text-muted-foreground" : node.status === "current" ? "text-primary" : "text-accent"
                  }`}>{node.status}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
