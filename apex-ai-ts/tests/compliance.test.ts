import { describe, it, expect } from "vitest";
import { computeAge, isMinorOrInvalid } from "../src/modules/compliance/age";

describe("computeAge", () => {
  it("returns age for valid birthdate", () => {
    const age = computeAge("2000-01-01");
    expect(age).toBeGreaterThanOrEqual(25);
  });

  it("returns null for empty input", () => {
    expect(computeAge("")).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(computeAge("not-a-date")).toBeNull();
  });

  it("returns 0 for today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(computeAge(today)).toBe(0);
  });
});

describe("isMinorOrInvalid", () => {
  it("blocks age < 16", () => {
    expect(isMinorOrInvalid("2015-01-01")).toBe(true);
  });

  it("allows age >= 16", () => {
    expect(isMinorOrInvalid("2000-01-01")).toBe(false);
  });

  it("blocks invalid input", () => {
    expect(isMinorOrInvalid("")).toBe(true);
  });
});
