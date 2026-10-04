import { describe, expect, it } from "vitest";
import { vestedAt } from "./vesting";

const s = { total: 1_000n, start: 1_000n, cliff: 100n, duration: 400n };

describe("vestedAt (mirrors the contract)", () => {
  it("is zero before the cliff", () => expect(vestedAt(s, 1_099)).toBe(0n));
  it("releases accrued tokens at the cliff", () => expect(vestedAt(s, 1_100)).toBe(250n));
  it("is linear afterwards and capped at total", () => {
    expect(vestedAt(s, 1_200)).toBe(500n);
    expect(vestedAt(s, 9_999)).toBe(1_000n);
  });
});
