import jsPDF from "jspdf";

interface ConfirmationData {
  reference: string;
  offerTitle: string;
  companyName: string;
  amount: number;
  currency: string;
  status: string;
  date: string; // ISO string or locale date
  rate?: number;
  maturityDate?: string;
  iban?: string;
  paymentDeadline?: string;
}

export function generateConfirmationPdf(data: ConfirmationData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Investment Confirmation", W / 2, y, { align: "center" });
  y += 10;

  doc.setDrawColor(40, 80, 120);
  doc.setLineWidth(0.5);
  doc.line(20, y, W - 20, y);
  y += 10;

  // Reference & date
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Date: ${new Date(data.date).toLocaleDateString("en-GB")}`, 20, y);
  doc.text(`Reference: ${data.reference}`, W - 20, y, { align: "right" });
  y += 12;

  // Investment details section
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Investment Details", 20, y);
  y += 2;
  doc.setDrawColor(200);
  doc.line(20, y, W - 20, y);
  y += 8;

  const addRow = (label: string, value: string) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(label, 25, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(value, W - 25, y, { align: "right" });
    y += 7;
  };

  addRow("Offer", data.offerTitle);
  addRow("Company", data.companyName);
  addRow("Amount Invested", `${data.amount.toLocaleString()} ${data.currency}`);
  addRow("Status", data.status);

  if (data.rate !== undefined) {
    addRow("Return Rate", `${data.rate.toFixed(1)}%`);
    const expectedPayout = data.amount * (1 + data.rate / 100);
    const profit = expectedPayout - data.amount;
    addRow("Expected Payout", `${expectedPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${data.currency}`);
    addRow("Expected Profit", `+${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${data.currency}`);
  }

  if (data.maturityDate) {
    addRow("Maturity Date", data.maturityDate);
  }

  // Payment details (if IBAN provided)
  if (data.iban || data.paymentDeadline) {
    y += 5;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Payment Details", 20, y);
    y += 2;
    doc.setDrawColor(200);
    doc.line(20, y, W - 20, y);
    y += 8;

    if (data.iban) addRow("IBAN", data.iban);
    addRow("Payment Reference", data.reference);
    addRow("Amount to Transfer", `${data.amount.toLocaleString()} ${data.currency}`);
    if (data.paymentDeadline) addRow("Payment Deadline", data.paymentDeadline);
  }

  // Important notice
  y += 8;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("Use the exact reference number so your payment can be matched.", 20, y);
  y += 5;
  doc.text("Capital at risk. Investments are not covered by deposit guarantee schemes.", 20, y);
  y += 10;
  doc.text(`© ${new Date().getFullYear()} Makrill Trade. All rights reserved.`, 20, y);

  doc.save(`Investment-Confirmation-${data.reference}.pdf`);
}
