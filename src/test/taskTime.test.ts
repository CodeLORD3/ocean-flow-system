import { describe, expect, it } from "vitest";
import {
  compareByTime,
  daypartOf,
  durationText,
  groupByDaypart,
  remainingMinutes,
  taskTime,
} from "@/lib/taskTime";

describe("tidsmodellen för uppgifter", () => {
  it("exakt tid visas som klocktid", () => {
    expect(taskTime({ specific_time: "07:15:00" })).toMatchObject({ kind: "specific", minutes: 435, label: "07:15" });
  });

  it("tidsfönster visas som intervall", () => {
    expect(taskTime({ time_from: "06:00", time_to: "09:00" })).toMatchObject({
      kind: "window",
      label: "06:00–09:00",
    });
  });

  it("dagsdel utan klocktid ger dagsdelens namn", () => {
    expect(taskTime({ daypart: "morgon" })).toMatchObject({ kind: "daypart", label: "Morgon" });
  });

  it("ingen tid ger tom text, aldrig streck", () => {
    expect(taskTime({})).toEqual({ kind: "none", minutes: null, label: "" });
  });

  it("äldre fritext tolkas som tid", () => {
    expect(taskTime({ time_label: "07:45" }).minutes).toBe(465);
  });

  it("grupperar på dagsdel", () => {
    expect(daypartOf({ specific_time: "07:15" })).toBe("morgon");
    expect(daypartOf({ specific_time: "12:00" })).toBe("mitt");
    expect(daypartOf({ specific_time: "18:00" })).toBe("kvall");
    expect(daypartOf({})).toBe("ingen");
  });

  it("sorterar kronologiskt och lägger tidlösa sist", () => {
    const rows = [{ specific_time: "08:00" }, {}, { specific_time: "07:15" }];
    expect([...rows].sort(compareByTime).map((r) => (r as any).specific_time)).toEqual([
      "07:15",
      "08:00",
      undefined,
    ]);
  });

  it("grupper utan uppgifter faller bort", () => {
    const groups = groupByDaypart([{ specific_time: "07:15" }, {}]);
    expect(groups.map((g) => g.key)).toEqual(["morgon", "ingen"]);
  });

  it("beräknad tid visas bara när den finns", () => {
    expect(durationText(15)).toBe("15 min");
    expect(durationText(90)).toBe("1 h 30 min");
    expect(durationText(null)).toBe("");
  });

  it("återstående tid räknar bara det som är kvar", () => {
    expect(
      remainingMinutes([
        { done: true, estimated_minutes: 10 },
        { done: false, estimated_minutes: 15 },
        { done: false },
      ]),
    ).toBe(15);
  });
});
