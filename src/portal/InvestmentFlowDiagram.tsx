import { useMemo } from "react";
import { motion } from "framer-motion";
import { parseISO, format, differenceInDays, isAfter, isBefore } from "date-fns";
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

interface MilestoneNode {
  date: Date;
  label: string;
  amount: number;
  type: "start" | "current" | "payout" | "maturity";
  status: "completed" | "current" | "upcoming";
  offerTitle?: string;
}

export default function InvestmentFlowDiagram({ pledges }: { pledges: Pledge[] }) {
  const activePledges = pledges.filter((p) => p.status === "Active" && p.trade_offers);

  const { milestones, totalInvested, totalPayout, progressPercent } = useMemo(() => {
    if (activePledges.length === 0) {
      return { milestones: [], totalInvested: 0, totalPayout: 0, progressPercent: 0 };
    }

    const now = new Date();
    const nodes: MilestoneNode[] = [];

    let invested = 0;
    let payout = 0;

    let earliestStart: Date | null = null;
    let latestMaturity: Date | null = null;

    activePledges.forEach((p: any) => {
      const offer = p.trade_offers;
      if (!offer) return;
      const amt = Number(p.amount);
      const rate = Number(offer.interest_rate);
      invested += amt;
      payout += amt * (1 + rate / 100);

      const startDate = offer.purchase_date ? parseISO(offer.purchase_date) : parseISO(p.created_at);
      const maturityDate = parseISO(offer.maturity_date);

      if (!earliestStart || isBefore(startDate, earliestStart)) earliestStart = startDate;
      if (!latestMaturity || isAfter(maturityDate, latestMaturity)) latestMaturity = maturityDate;

      nodes.push({
        date: startDate,
        label: `Invested in ${offer.title}`,
        amount: amt,
        type: "start",
        status: "completed",
        offerTitle: offer.title,
      });

      const matured = isBefore(maturityDate, now) || differenceInDays(maturityDate, now) <= 0;
      nodes.push({
        date: maturityDate,
        label: `Payout – ${offer.title}`,
        amount: Math.round(amt * (1 + rate / 100)),
        type: "payout",
        status: matured ? "completed" : "upcoming",
        offerTitle: offer.title,
      });
    });

    nodes.sort((a, b) => a.date.getTime() - b.date.getTime());

    if (earliestStart && latestMaturity) {
      const totalSpan = latestMaturity.getTime() - earliestStart.getTime();
      const elapsed = now.getTime() - earliestStart.getTime();
      const progress = totalSpan > 0 ? Math.min(100, Math.max(0, (elapsed / totalSpan) * 100)) : 0;

      if (isAfter(now, earliestStart) && isBefore(now, latestMaturity)) {
        nodes.push({
          date: now,
          label: "You are here",
          amount: Math.round(invested + (payout - invested) * (progress / 100)),
          type: "current",
          status: "current",
        });
        nodes.sort((a, b) => a.date.getTime() - b.date.getTime());
      }

      return { milestones: nodes, totalInvested: invested, totalPayout: Math.round(payout), progressPercent: progress };
    }

    return { milestones: nodes, totalInvested: invested, totalPayout: Math.round(payout), progressPercent: 0 };
  }, [activePledges]);

  if (activePledges.length === 0) return null;

  const nodeStyles = {
    completed: {
      bg: "bg-muted",
      border: "border-border",
      text: "text-muted-foreground",
      icon: "text-muted-foreground",
      dot: "bg-muted-foreground",
    },
    current: {
      bg: "bg-primary/10",
      border: "border-primary",
      text: "text-primary",
      icon: "text-primary",
      dot: "bg-primary",
    },
    upcoming: {
      bg: "bg-accent/10",
      border: "border-accent",
      text: "text-accent",
      icon: "text-accent",
      dot: "bg-accent",
    },
  };

  const NodeIcon = ({ type }: { type: string }) => {
    switch (type) {
      case "start": return <CircleDollarSign className="h-3.5 w-3.5" />;
      case "current": return <MapPin className="h-3.5 w-3.5" />;
      case "payout": return <TrendingUp className="h-3.5 w-3.5" />;
      case "maturity": return <Flag className="h-3.5 w-3.5" />;
      default: return <CircleDollarSign className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="border border-border bg-white p-4">
      <div className="flex items-center justify-between mb-4">
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

      <div className="mb-5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Invested: <span className="font-mono font-bold text-foreground">{totalInvested.toLocaleString()} kr</span></span>
          <span>Expected Payout: <span className="font-mono font-bold text-green-600">{totalPayout.toLocaleString()} kr</span></span>
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

      <TooltipProvider>
        <div className="relative">
          <div className="hidden md:block">
            <div className="relative h-24">
              <div className="absolute top-10 left-0 right-0 h-px bg-border" />
              <motion.div
                className="absolute top-10 left-0 h-px bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />

              {milestones.map((node, i) => {
                const leftPercent = milestones.length > 1
                  ? (i / (milestones.length - 1)) * 100
                  : 50;
                const style = nodeStyles[node.status];

                return (
                  <Tooltip key={`${node.type}-${i}`}>
                    <TooltipTrigger asChild>
                      <motion.div
                        className="absolute flex flex-col items-center"
                        style={{ left: `${leftPercent}%`, transform: "translateX(-50%)" }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 + i * 0.15 }}
                      >
                        {i % 2 === 0 ? (
                          <>
                            <div className="text-center mb-1">
                              <div className={`text-[9px] font-medium ${style.text} leading-tight max-w-[90px] truncate`}>
                                {node.type === "current" ? "YOU ARE HERE" : format(node.date, "d MMM")}
                              </div>
                              <div className="text-[9px] font-mono font-bold text-foreground">
                                {node.amount.toLocaleString()} kr
                              </div>
                            </div>
                            <div className={`h-5 w-5 rounded-full border-2 ${style.border} ${style.bg} flex items-center justify-center ${style.icon} relative z-10`}>
                              <NodeIcon type={node.type} />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={`h-5 w-5 rounded-full border-2 ${style.border} ${style.bg} flex items-center justify-center ${style.icon} relative z-10 mt-[22px]`}>
                              <NodeIcon type={node.type} />
                            </div>
                            <div className="text-center mt-1">
                              <div className={`text-[9px] font-medium ${style.text} leading-tight max-w-[90px] truncate`}>
                                {node.type === "current" ? "YOU ARE HERE" : format(node.date, "d MMM")}
                              </div>
                              <div className="text-[9px] font-mono font-bold text-foreground">
                                {node.amount.toLocaleString()} kr
                              </div>
                            </div>
                          </>
                        )}
                      </motion.div>
                    </TooltipTrigger>
                    <TooltipContent side={i % 2 === 0 ? "top" : "bottom"} className="text-[10px] max-w-[180px]">
                      <p className="font-semibold">{node.label}</p>
                      <p className="text-muted-foreground">{format(node.date, "d MMM yyyy")}</p>
                      <p className="font-mono font-bold">{node.amount.toLocaleString()} kr</p>
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

          <div className="md:hidden space-y-0">
            {milestones.map((node, i) => {
              const style = nodeStyles[node.status];
              const isLast = i === milestones.length - 1;
              return (
                <Tooltip key={`m-${node.type}-${i}`}>
                  <TooltipTrigger asChild>
                    <motion.div
                      className="flex items-start gap-3"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 + i * 0.1 }}
                    >
                      <div className="flex flex-col items-center">
                        <div className={`h-5 w-5 rounded-full border-2 ${style.border} ${style.bg} flex items-center justify-center ${style.icon} shrink-0 relative z-10`}>
                          <NodeIcon type={node.type} />
                        </div>
                        {!isLast && (
                          <div className="w-px h-8 bg-border relative">
                            {node.status === "completed" && (
                              <div className="absolute inset-0 bg-muted-foreground/40" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="pb-3 -mt-0.5">
                        <div className={`text-[10px] font-semibold ${style.text}`}>
                          {node.type === "current" ? "YOU ARE HERE" : node.label}
                        </div>
                        <div className="text-[9px] text-muted-foreground">{format(node.date, "d MMM yyyy")}</div>
                        <div className="text-[10px] font-mono font-bold text-foreground">{node.amount.toLocaleString()} kr</div>
                      </div>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-[10px]">
                    <p className="font-semibold">{node.label}</p>
                    <p className={`uppercase text-[9px] font-semibold ${
                      node.status === "completed" ? "text-muted-foreground" : node.status === "current" ? "text-primary" : "text-accent"
                    }`}>{node.status}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}
