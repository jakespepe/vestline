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

export async function scanSchedules(max = 80): Promise<Schedule[]> {
  const out: Schedule[] = [];
  for (let id = 1; id <= max; id++) {
    try {
      out.push(await vestline.read<Schedule>("get_schedule", [u64(id)]));
    } catch {
      break;
    }
  }
  return out;
}

export const PRESETS: { name: string; cliff: number; duration: number; revocable: boolean }[] = [
  { name: "Employee · 4y, 1y cliff", cliff: YEAR, duration: 4 * YEAR, revocable: true },
  { name: "Advisor · 2y, no cliff", cliff: 0, duration: 2 * YEAR, revocable: true },
  { name: "Investor · 1y lock, then 2y", cliff: YEAR, duration: 3 * YEAR, revocable: false },
  { name: "Bonus · all at 6 months", cliff: YEAR / 2, duration: YEAR / 2, revocable: false },
];
