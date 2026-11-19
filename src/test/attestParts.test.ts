import { describe, expect, it } from "vitest";
import { asStampedDecision, decisionOptions, pendingParts, type PartsAttestation } from "@/lib/attestParts";

const day = (over: Partial<PartsAttestation> = {}): PartsAttestation => ({
  id: "a",
  status: "flagged",
  basis: null,
  computed: {
    model: "delar",
    parts: [
      { kind: "tidig_in", minutes: 28 },
      { kind: "tidig_ut", minutes: 40 },
    ],
  },
  part_decisions: {},
  ...over,
});

describe("avvikelser per del av dagen", () => {
  it("varje del utanför schemat väntar på attest tills den är beslutad", () => {
    expect(pendingParts(day()).map((p) => p.kind)).toEqual(["tidig_in", "tidig_ut"]);
    expect(pendingParts(day({ part_decisions: { tidig_in: { decision: "godkand" } } })).map((p) => p.kind)).toEqual(["tidig_ut"]);
  });

  it("extra tid godkänns eller nekas, kortare tid betalas som stämplat eller schema", () => {
    expect(decisionOptions("sen_ut").map((o) => o.value)).toEqual(["godkand", "nekad"]);
    expect(decisionOptions("sen_in").map((o) => o.value)).toEqual(["stamplad", "schema"]);
    expect(decisionOptions("missat_pass").map((o) => o.value)).toEqual(["stamplad", "schema"]);
  });

  it("attestera som stämplat godkänner extra tid och betalar kortare tid som stämplad", () => {
    expect(asStampedDecision("tidig_in")).toBe("godkand");
    expect(asStampedDecision("tidig_ut")).toBe("stamplad");
  });

  it("en manuellt justerad dag har inga delar kvar att attestera", () => {
    expect(pendingParts(day({ status: "approved", basis: "justerad" }))).toEqual([]);
  });

  it("dagar utan uppdelning har inga avvikelsedelar", () => {
    expect(pendingParts(day({ computed: { parts: [{ kind: "sen_in", minutes: 30 }] } }))).toEqual([]);
  });
});
