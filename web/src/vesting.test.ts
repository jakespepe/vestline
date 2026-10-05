import { describe, expect, it } from "vitest";
import { scheduleCsv, vestedAt } from "./vesting";

const s = { total: 1_000n, start: 1_000n, cliff: 100n, duration: 400n };

describe("vestedAt (mirrors the contract)", () => {
  it("is zero before the cliff", () => expect(vestedAt(s, 1_099)).toBe(0n));
  it("releases accrued tokens at the cliff", () => expect(vestedAt(s, 1_100)).toBe(250n));
  it("is linear afterwards and capped at total", () => {
    expect(vestedAt(s, 1_200)).toBe(500n);
    expect(vestedAt(s, 9_999)).toBe(1_000n);
  });
});

describe("scheduleCsv", () => {
  const s = { id: 1n, total: 1200n, start: 1_704_067_200n /* 2024-01-01 */, cliff: 0n, duration: 365n * 86_400n };
  const csv = scheduleCsv(s, (v) => String(v)).trim().split("\n");

  it("has a header, monthly rows and a fully vested final row", () => {
    expect(csv[0]).toBe("date,vested,unvested");
    expect(csv[1]).toBe("2024-01-01,0,1200");
    expect(csv.at(-1)).toBe("2024-12-31,1200,0");
    expect(csv.length).toBe(14);
  });

  it("matches vestedAt on every row", () => {
    for (const row of csv.slice(1, -1)) {
      const [date, vested] = row.split(",");
      const t = Date.parse(`${date}T00:00:00Z`) / 1000;
      expect(BigInt(vested)).toBe(vestedAt(s, t));
    }
  });
});
