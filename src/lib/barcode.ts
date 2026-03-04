/**
 * Generate a valid EAN-13 barcode string with check digit.
 * prefix: 2-digit company/internal prefix (e.g. "20" for internal use)
 * sequence: up to 10-digit number
 */
export function generateEAN13(prefix: string = "20", sequence: number): string {
  const seqStr = String(sequence).padStart(10, "0");
  const base = (prefix + seqStr).slice(0, 12);

  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  return base + checkDigit;
}

/**
 * Validate an EAN-13 barcode
 */
export function isValidEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(code[12]);
}
