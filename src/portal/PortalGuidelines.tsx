export default function PortalGuidelines() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">Investment Guidelines</h1>
        <p className="text-sm text-muted-foreground mt-1">Everything you need to know about investing through Ocean Trade.</p>
      </div>

      {[
        {
          title: "1. How Deals Are Structured",
          content: `Ocean Trade offers are structured as short-term trade finance deals. A trading company purchases physical goods (such as seafood, commodities, or other trade goods) and needs funding to bridge the gap between purchase and sale.\n\nInvestors provide this funding. In return, they receive the principal plus a fixed return at the end of the deal (maturity). This is known as a "bullet repayment" structure — there are no interim interest payments. The full amount (principal + return) is paid out in a single lump sum at maturity.`,
        },
        {
          title: "2. How Return Rates Are Calculated",
          content: `Each offer displays an annual return rate (e.g. 12% p.a.) and a deal-specific return based on the tenor (duration).\n\nFor example:\n• Offer with 12% annual return and 90-day tenor\n• Investment of 100,000 kr\n• Deal return = 100,000 × 12% × (90 / 365) = 2,959 kr\n• Total payout at maturity = 102,959 kr\n\nThe return is fixed at the time of commitment and does not change during the investment period.`,
        },
        {
          title: "3. Risk Factors and Collateral",
          content: `All investments carry risk. Key risk factors include:\n\n• Default risk — the trading company may fail to repay.\n• Market risk — the value of the underlying goods may decline.\n• Liquidity risk — you cannot exit before maturity.\n• Operational risk — delays in shipping, customs, or payment processing.\n\nMany offers include collateral, such as the goods in transit, receivables, or other assets. The Loan-to-Value (LTV) ratio indicates how much of the deal is covered by collateral. An LTV of 75% means the collateral covers 75% of the funded amount. Lower LTV generally means better protection, but collateral value can fluctuate.`,
        },
        {
          title: "4. How to Read an Offer",
          content: `Each offer page contains the following key fields:\n\n• Title — the name of the deal.\n• Status — Draft, Open (accepting investments), Funded, Closed, or Repaid.\n• Target Amount — the total funding needed for the deal.\n• Funded Amount — how much has been committed so far.\n• Interest Rate — the annual return rate.\n• Tenor — the duration of the deal in days.\n• Maturity Date — when the deal ends and payout is due.\n• Min / Max Pledge — the minimum and maximum amount you can invest.\n• Collateral — what assets back the deal.\n• LTV — Loan-to-Value ratio.\n• Sector — the industry of the trading company (e.g. Seafood, Agriculture).\n• Origin — where the goods are sourced.\n• Structure — the legal structure of the deal.\n• Risk Note — additional risk information specific to this deal.`,
        },
        {
          title: "5. What Happens at Maturity",
          content: `When a deal reaches its maturity date:\n\n1. The investment status changes from "Active" to "Matured".\n2. The trading company repays the full amount (principal + return) to Ocean Trade.\n3. The Ocean Trade team verifies the funds and initiates payout to your registered IBAN.\n4. Your investment status changes to "Paid Out" and moves to the History tab in your portfolio.\n\nPayouts are typically processed within 1–5 business days after the maturity date. You will receive notifications at each stage.`,
        },
        {
          title: "6. Important Reminders",
          content: `• Always review the full offer details before committing.\n• Diversify — don't put all your capital into a single deal.\n• Ensure your IBAN is correct and up to date in your profile.\n• Monitor your portfolio and notifications regularly.\n• Contact us at info@fiskskaldjur.ch if you have questions about any offer.`,
        },
      ].map((section) => (
        <div key={section.title} className="border border-border bg-white p-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">{section.title}</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{section.content}</p>
        </div>
      ))}
    </div>
  );
}
