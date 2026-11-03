import { describe, expect, it } from "vitest";
import { mailFailureReasonText } from "./mailFailureReasons";

describe("mailFailureReasonText", () => {
  it("förklarar för stora mejl", () => {
    expect(mailFailureReasonText("for_stort")).toBe("Mejlet är för stort för att läsas in automatiskt");
  });
  it("faller tillbaka på okänd orsak", () => {
    expect(mailFailureReasonText("nagot_nytt")).toBe("Okänd orsak");
  });
});
