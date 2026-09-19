import { describe, expect, it, beforeEach } from "vitest";
import {
  dequeueLine,
  enqueueLine,
  expiryTone,
  readQueue,
  type QueuedLine,
} from "@/lib/mobileCount";

/**
 * Räkningen på telefon får aldrig tappa en inmatning när täckningen försvinner.
 * Kön ligger i telefonen: raden läggs i kön innan den skickas och tas ur kön
 * först när databasen bekräftat.
 */

const row = (over: Partial<QueuedLine> = {}): QueuedLine => ({
  sessionId: "pass-1",
  productId: "prod-1",
  locationId: "plats-1",
  lotId: null,
  quantity: 4,
  systemQty: 6,
  unit: "kg",
  comment: null,
  at: new Date().toISOString(),
  ...over,
});

describe("kö för räknade rader", () => {
  beforeEach(() => localStorage.clear());

  it("lägger raden i kön och tar bort den när den är sparad", () => {
    enqueueLine(row());
    expect(readQueue()).toHaveLength(1);
    dequeueLine(row());
    expect(readQueue()).toHaveLength(0);
  });

  it("ersätter tidigare inmatning för samma vara och parti", () => {
    enqueueLine(row({ quantity: 4 }));
    enqueueLine(row({ quantity: 7 }));
    expect(readQueue()).toHaveLength(1);
    expect(readQueue()[0].quantity).toBe(7);
  });

  it("håller partier isär", () => {
    enqueueLine(row({ lotId: "parti-a" }));
    enqueueLine(row({ lotId: "parti-b" }));
    expect(readQueue()).toHaveLength(2);
  });
});

describe("bäst före-färg", () => {
  const dagar = (n: number) =>
    new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  it("passerat datum är rött", () => expect(expiryTone(dagar(-1))).toBe("passerad"));
  it("inom två dygn är gult", () => expect(expiryTone(dagar(1))).toBe("snart"));
  it("längre fram är utan varning", () => expect(expiryTone(dagar(9))).toBe("ok"));
  it("saknat datum ger ingen varning", () => expect(expiryTone(null)).toBe("ok"));
});
