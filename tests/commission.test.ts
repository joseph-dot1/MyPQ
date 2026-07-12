import { describe, it, expect } from "vitest";
import { computeCommissionKobo } from "../src/lib/commission";

describe("rep commission", () => {
  it("computes the configured percentage on the paid amount", () => {
    // ₦1,000 at 15% = ₦150
    expect(computeCommissionKobo(100000, 15)).toBe(15000);
  });

  it("floors fractional kobo", () => {
    expect(computeCommissionKobo(99999, 15)).toBe(14999);
  });

  it("returns zero for zero/negative amounts or percent", () => {
    expect(computeCommissionKobo(0, 15)).toBe(0);
    expect(computeCommissionKobo(-100, 15)).toBe(0);
    expect(computeCommissionKobo(100000, 0)).toBe(0);
  });
});
