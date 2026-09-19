import { describe, it, expect } from "vitest";
import { leadDaysForRegion, nextDeliveryDay } from "@/lib/deliveryDay";

const day = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d;
};

describe("nästa leveransdag", () => {
  it("Göteborg beställer på lördag till nästa öppetdag tisdag", () => {
    // Särö: tis–lör (2,3,4,5,6), en dags framförhållning
    const r = nextDeliveryDay({
      openWeekdays: [2, 3, 4, 5, 6],
      leadDays: 1,
      today: day("2026-09-19"), // lördag
    });
    expect(r.date).toBe("2026-09-22"); // tisdag
    expect(r.lastChanceThisWeek).toBe(true);
  });

  it("Eriksberg öppnar först onsdag", () => {
    const r = nextDeliveryDay({
      openWeekdays: [3, 4, 5, 6],
      leadDays: 1,
      today: day("2026-09-19"),
    });
    expect(r.date).toBe("2026-09-23");
  });

  it("Kungsholmen behöver två dagar och öppnar torsdag", () => {
    const r = nextDeliveryDay({
      openWeekdays: [4, 5, 6],
      leadDays: 2,
      today: day("2026-09-21"), // måndag
    });
    expect(r.date).toBe("2026-09-24"); // torsdag
  });

  it("Zollikons helgbeställning landar på onsdag", () => {
    const r = nextDeliveryDay({
      openWeekdays: [3, 4, 5, 6],
      leadDays: 2,
      today: day("2026-09-20"), // söndag
    });
    expect(r.date).toBe("2026-09-23");
  });

  it("stängd dag hoppas över", () => {
    const r = nextDeliveryDay({
      openWeekdays: [2, 3, 4, 5, 6],
      leadDays: 1,
      today: day("2026-09-19"),
      closedDates: ["2026-09-22"],
    });
    expect(r.date).toBe("2026-09-23");
  });

  it("framförhållning per region", () => {
    expect(leadDaysForRegion("stockholm")).toBe(2);
    expect(leadDaysForRegion("schweiz")).toBe(2);
    expect(leadDaysForRegion("vast")).toBe(1);
  });
});
