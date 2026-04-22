/**
 * Mock kontrollkod generator. Real implementation will call a CloudKontrollenhet.
 * Format mirrors the kind of opaque token Skatteverket-approved units return.
 */
export function generateMockControlCode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MK-${ts}-${rnd}`;
}
