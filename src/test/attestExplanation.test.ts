import { describe, expect, it } from "vitest";
import { explainAttestation, whenText } from "@/lib/attestExplanation";

const now = new Date("2026-11-19T13:30:00Z");
const accounts = (id: string) => (id === "u1" ? "caisacarning@gmail.com" : null);

// Adam Sandström 17 okt: schema 09:00–16:00, in 09:09, ut 17:02.
const adam = {
  id: "a",
  status: "approved",
  basis: "schema",
  approved_minutes: 390,
  decided_at: "2026-11-19T11:48:04Z",
  decided_by: "u1",
  computed: {
    model: "delar",
    parts: [
      { kind: "sen_in" as const, minutes: 9, sched: "2026-10-17T07:00:00Z", stamp: "2026-10-17T07:09:19Z" },
      { kind: "sen_ut" as const, minutes: 63, sched: "2026-10-17T14:00:00Z", stamp: "2026-10-17T15:02:47Z" },
    ],
  },
  part_decisions: {},
};

describe("förklaring av attesten", () => {
  it("Schematid för hela dagen: sena minuter räknas, tiden efter schemat betalas inte, kontot anges", () => {
    expect(explainAttestation(adam, accounts, now)).toBe(
      "Dagen attesterades i dag kl. 12:48 med Schematid för hela dagen. Då betalas bara schemat. " +
        "De 9 sena minuterna på morgonen räknas som arbetade, men tiden efter 16:00 (1 h 03 min) betalas inte. " +
        "Beslutet togs från kontot caisacarning@gmail.com.",
    );
  });

  it("beslut per avvikelse: godkänd extra tid betalas, nekad betalas inte", () => {
    const text = explainAttestation(
      {
        ...adam,
        basis: "avvikelse",
        part_decisions: {
          sen_in: { decision: "stamplad", by: "u1", at: "2026-11-19T11:48:04Z" },
          sen_ut: { decision: "nekad", by: "u1", at: "2026-11-19T11:48:04Z" },
        },
      },
      accounts,
      now,
    );
    expect(text).toContain("De 9 sena minuterna på morgonen dras av");
    expect(text).toContain("tiden efter 16:00 (1 h 03 min) betalas inte");
  });

  it("obeslutade avvikelser sägs vänta på attest", () => {
    const text = explainAttestation({ ...adam, status: "flagged", basis: null }, accounts, now);
    expect(text).toContain("2 avvikelser väntar på attest");
  });

  it("okänt konto skrivs som okänt konto", () => {
    expect(explainAttestation({ ...adam, decided_by: "u2" }, accounts, now)).toContain("kontot okänt konto");
  });

  it("tidpunkt i dag, i går och annat datum", () => {
    expect(whenText("2026-11-19T11:48:00Z", now)).toBe("i dag kl. 12:48");
    expect(whenText("2026-11-18T08:00:00Z", now)).toBe("i går kl. 09:00");
    expect(whenText("2026-11-10T08:00:00Z", now)).toBe("10 nov kl. 09:00");
  });
});
