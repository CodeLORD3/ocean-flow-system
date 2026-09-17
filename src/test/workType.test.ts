import { describe, expect, it } from "vitest";
import { guessWorkType, workTypeLabel, workTypeOf } from "@/lib/workType";

describe("arbetstyper", () => {
  it("mappar butikens befintliga rubriker", () => {
    expect(guessWorkType("Golv och avlopp")).toBe("stadning");
    expect(guessWorkType("Kyl och frys")).toBe("temperatur");
    expect(guessWorkType("Kassa och administration")).toBe("rapporter");
    expect(guessWorkType("Personal och morgondag")).toBe("personal");
    expect(guessWorkType("Produktion och redskap")).toBe("underhall");
    expect(guessWorkType("Säkerhet och Lås")).toBe("underhall");
    expect(guessWorkType("Butik o Disk")).toBe("stadning");
  });

  it("faller tillbaka på Övrigt", () => {
    expect(guessWorkType(null)).toBe("ovrigt");
    expect(guessWorkType("Något helt annat")).toBe("ovrigt");
    expect(workTypeLabel("ovrigt")).toBe("Övrigt");
  });

  it("låter sparat värde gå före gissning", () => {
    expect(workTypeOf({ work_type: "rapporter", category: "Golv och avlopp" })).toBe("rapporter");
    expect(workTypeOf({ work_type: "trams", category: "Golv och avlopp" })).toBe("stadning");
    expect(workTypeOf({ section: "Beställningar" })).toBe("bestallning");
  });
});
