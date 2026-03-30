export default function PortalPrivacy() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mt-1">Last updated: March 2026</p>
      </div>

      {[
        {
          title: "1. What Data We Collect",
          content: `Ocean Trade collects the following personal data when you register and use the platform:\n\n• Full name\n• Email address\n• Country of residence\n• Date of birth (if provided)\n• Telephone number (if provided)\n• Postal address (if provided)\n• IBAN (bank account number for payouts)\n• Investment activity (commitments, amounts, dates, offer participation)\n• Login and session data (IP address, browser type, timestamps)`,
        },
        {
          title: "2. Why We Collect Your Data",
          content: `We process your personal data for the following purposes:\n\n• To operate the platform and provide the investment service.\n• To verify your identity and eligibility.\n• To process your investments and facilitate payouts.\n• To communicate with you about your account, investments, and platform updates.\n• To comply with applicable laws and regulations, including anti-money laundering (AML) and know-your-customer (KYC) obligations.\n• To improve the platform and user experience.`,
        },
        {
          title: "3. Legal Basis",
          content: `We process your data based on:\n\n• Contract performance — processing necessary to provide the service you signed up for.\n• Legal obligation — processing required by law (e.g. AML/KYC compliance).\n• Legitimate interest — improving the platform, fraud prevention, and internal analytics.\n• Consent — where explicitly given (e.g. marketing communications).`,
        },
        {
          title: "4. Data Retention",
          content: `We retain your personal data for as long as your account is active and for a period of 5 years after account closure, or longer if required by law (e.g. financial record-keeping obligations). Investment transaction records are retained for 7 years in accordance with Swedish bookkeeping regulations.`,
        },
        {
          title: "5. Your Rights (GDPR)",
          content: `Under the General Data Protection Regulation (GDPR), you have the following rights:\n\n• Right of access — request a copy of your personal data.\n• Right to rectification — correct inaccurate or incomplete data.\n• Right to erasure — request deletion of your data (subject to legal retention requirements).\n• Right to restrict processing — limit how we use your data.\n• Right to data portability — receive your data in a structured, machine-readable format.\n• Right to object — object to processing based on legitimate interest.\n• Right to withdraw consent — where processing is based on consent.\n\nTo exercise any of these rights, contact us at the email below.`,
        },
        {
          title: "6. Data Sharing",
          content: `We do not sell your personal data. We may share data with:\n\n• Banking partners — to process payments and verify IBAN details.\n• Regulatory authorities — when required by law.\n• Service providers — hosting, email, and analytics providers that process data on our behalf under strict data processing agreements.`,
        },
        {
          title: "7. Security",
          content: `We implement appropriate technical and organisational measures to protect your personal data against unauthorised access, alteration, disclosure, or destruction. All data is encrypted in transit (TLS) and at rest.`,
        },
        {
          title: "8. Contact",
          content: `For questions about this Privacy Policy or to exercise your data rights, contact:\n\nOcean Trade AB\nEmail: info@fiskskaldjur.ch`,
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
