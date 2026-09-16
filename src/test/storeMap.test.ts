import { describe, it, expect } from "vitest";
import { progressFor, dueText } from "@/lib/mapStatus";
import { nextInstanceName } from "@/hooks/useStoreMap";
import type { MapObject, MapTask } from "@/hooks/useStoreMap";

const task = (p: Partial<MapTask>): MapTask =>
  ({
    id: "t",
    task: "Rengör",
    section: "Städ",
    done: false,
    done_at: null,
    signature: null,
    time_label: null,
    zone_id: null,
    map_object_id: null,
    checklist_day_id: "d",
    ...p,
  }) as MapTask;

const obj = (name: string) => ({ name }) as MapObject;

describe("Butikskartan — status ur riktiga checklisteuppgifter", () => {
  it("räknar framsteg per zon", () => {
    const p = progressFor([task({ id: "1", done: true }), task({ id: "2" })], 0);
    expect(p.done).toBe(1);
    expect(p.total).toBe(2);
    expect(p.percent).toBe(50);
    expect(p.status).toBe("amber");
  });

  it("visar grönt först när allt är klart", () => {
    expect(progressFor([task({ id: "1", done: true })], 0).status).toBe("green");
  });

  it("öppen avvikelse gör zonen röd även när uppgifterna är klara", () => {
    const p = progressFor([task({ id: "1", done: true })], 1);
    expect(p.status).toBe("red");
    expect(p.openIssues).toBe(1);
  });

  it("utan uppgifter finns ingen aktivitet att visa", () => {
    expect(progressFor([], 0).status).toBe("grey");
  });

  it("försenad uppgift markeras", () => {
    expect(dueText("08:00", false)).toContain("08:00");
    expect(dueText("08:00", true)).toBeNull();
  });
});

describe("Objektnamn numreras automatiskt", () => {
  it("ger nästa lediga nummer", () => {
    expect(nextInstanceName("Kyl", [obj("Kyl 01"), obj("Kyl 02")])).toBe("Kyl 03");
  });
  it("börjar på 01 i tom butik", () => {
    expect(nextInstanceName("Våg", [])).toBe("Våg 01");
  });
});
