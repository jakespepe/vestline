import { client, u64 } from "./lib/stellar";

export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID ?? "CBPVPFKW65VFYI7A2AZV3QO2ATGRYCNGZM5VLZGCCOM3KNNZEM46W5KN";
export const ERRORS: Record<number, string> = {
  1: "No schedule with that id.",
  2: "Check the schedule: amount > 0, duration > 0, cliff ≤ duration, and grantor ≠ beneficiary.",
  3: "Nothing has vested since your last claim.",
  4: "This grant isn't revocable.",
  5: "This grant was already revoked.",
  6: "Only the beneficiary can do that.",
};
export const vestline = client(CONTRACT_ID, ERRORS);

export interface Schedule {
  id: bigint;
  grantor: string;
  beneficiary: string;
  token: string;
  total: bigint;
  start: bigint;
  cliff: bigint;
  duration: bigint;
  claimed: bigint;
  revocable: boolean;
  revoked: boolean;
}

export const YEAR = 31_536_000;
export const DAY = 86_400;

/** Same formula as the contract (cliff + linear). */
export function vestedAt(s: Pick<Schedule, "total" | "start" | "cliff" | "duration">, t: number): bigint {
  const start = Number(s.start);
  if (t < start + Number(s.cliff)) return 0n;
  const elapsed = t - start;
  if (elapsed >= Number(s.duration)) return s.total;
  return (s.total * BigInt(Math.floor(elapsed))) / s.duration;
}

const getSchedule = (id: number) => vestline.read<Schedule>("get_schedule", [u64(id)]);

/**
 * All schedules. Uses schedule_count with parallel batches when the contract
 * has it; older deployments fall back to probing ids until the first gap.
 */
export async function scanSchedules(batch = 10): Promise<Schedule[]> {
  const out: Schedule[] = [];
  let count: number | null = null;
  try {
    count = Number(await vestline.read<bigint>("schedule_count"));
  } catch {
    count = null;
  }
  if (count !== null) {
    for (let start = 1; start <= count; start += batch) {
      const ids = Array.from({ length: Math.min(batch, count - start + 1) }, (_, i) => start + i);
      const got = await Promise.allSettled(ids.map(getSchedule));
      for (const r of got) if (r.status === "fulfilled") out.push(r.value);
    }
    return out;
  }
  for (let id = 1; ; id++) {
    try {
      out.push(await getSchedule(id));
    } catch {
      break;
    }
  }
  return out;
}

/** Month-by-month vesting table as CSV (one row per month plus the final date). */
export function scheduleCsv(s: Pick<Schedule, "id" | "total" | "start" | "cliff" | "duration">, fmt: (v: bigint) => string): string {
  const rows = ["date,vested,unvested"];
  const start = Number(s.start);
  const end = start + Number(s.duration);
  const d = new Date(start * 1000);
  for (;;) {
    const t = Math.floor(d.getTime() / 1000);
    if (t >= end) break;
    const vested = vestedAt(s, t);
    rows.push(`${d.toISOString().slice(0, 10)},${fmt(vested)},${fmt(s.total - vested)}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  rows.push(`${new Date(end * 1000).toISOString().slice(0, 10)},${fmt(s.total)},${fmt(0n)}`);
  return rows.join("\n") + "\n";
}

export const PRESETS: { name: string; cliff: number; duration: number; revocable: boolean }[] = [
  { name: "Employee · 4y, 1y cliff", cliff: YEAR, duration: 4 * YEAR, revocable: true },
  { name: "Advisor · 2y, no cliff", cliff: 0, duration: 2 * YEAR, revocable: true },
  { name: "Investor · 1y lock, then 2y", cliff: YEAR, duration: 3 * YEAR, revocable: false },
  { name: "Bonus · all at 6 months", cliff: YEAR / 2, duration: YEAR / 2, revocable: false },
];
