export default function PortalTerms() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">Terms of Use</h1>
        <p className="text-sm text-muted-foreground mt-1">Last updated: March 2026</p>
      </div>

      {[
        {
          title: "1. About Ocean Trade",
          content: `Ocean Trade is a digital investment platform that connects qualified investors with short-term trade finance opportunities. The platform is operated by Ocean Trade AB, a company registered in Sweden. Ocean Trade acts solely as an arranger — facilitating the structuring, funding, and settlement of trade finance deals between investors and trading companies. Ocean Trade is not a bank, lender, or licensed investment advisor.`,
        },
        {
          title: "2. Eligibility",
          content: `By creating an account and using the platform, you confirm that:\n\n• You are at least 18 years of age.\n• You are not a US person (as defined under US tax law) and are not investing from a US-based account.\n• You understand that investments made through Ocean Trade are not covered by any government deposit guarantee scheme or investor compensation fund.\n• You have read and understood the risks associated with trade finance investments.`,
        },
        {
          title: "3. How Investments Work",
          content: `When you invest through Ocean Trade, you commit a specific amount to a trade finance deal ("Offer"). The process is as follows:\n\n1. You browse available offers and select one that fits your investment profile.\n2. You commit an amount within the offer's minimum and maximum limits.\n3. You transfer the committed funds to the designated bank account using the unique payment reference provided.\n4. Once your funds are received and confirmed by the admin team, your investment becomes active.\n5. At the maturity date, the trading company repays the principal plus the agreed return.\n6. Ocean Trade facilitates the payout to your registered IBAN.`,
        },
        {
          title: "4. Risks",
          content: `All investments carry risk. By using Ocean Trade, you acknowledge and accept the following:\n\n• Trade finance investments can fail. The underlying trading company may default, and you could lose part or all of your invested capital.\n• While offers may include collateral (such as goods in transit or receivables), the value of collateral can fluctuate and may not cover the full loss in a default scenario.\n• Past performance is not indicative of future results.\n• Ocean Trade does not guarantee any returns or the safety of your principal.\n• Investments are illiquid — you cannot withdraw your funds before the maturity date.`,
        },
        {
          title: "5. Platform Role",
          content: `Ocean Trade acts exclusively as an arranger and intermediary. We do not:\n\n• Lend money or act as a counterparty to any investment.\n• Provide investment advice or personal recommendations.\n• Guarantee the performance of any offer or trading company.\n\nOcean Trade conducts due diligence on trading companies and deal structures, but this does not eliminate risk. Investors are responsible for their own investment decisions.`,
        },
        {
          title: "6. Account and Data",
          content: `You are responsible for maintaining the confidentiality of your login credentials. You must provide accurate and up-to-date information in your profile, including your IBAN for payout purposes. Ocean Trade reserves the right to suspend or terminate accounts that violate these terms or engage in fraudulent activity.`,
        },
        {
          title: "7. Governing Law",
          content: `These Terms of Use are governed by and construed in accordance with the laws of Sweden. Any disputes arising from or in connection with these terms shall be subject to the exclusive jurisdiction of the courts of Sweden.`,
        },
        {
          title: "8. Contact",
          content: `For questions about these terms, contact us at info@fiskskaldjur.ch.`,
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
