import { vestedAt, type Schedule } from "./vesting";

type S = Pick<Schedule, "total" | "start" | "cliff" | "duration"> & { claimed?: bigint; revoked?: boolean };

/** Vesting curve with cliff marker, "now" line and claimed band. */
export function Curve({ s, now = Date.now() / 1000, height = 220 }: { s: S; now?: number; height?: number }) {
  const W = 640;
  const H = height;
  const pad = 28;
  const start = Number(s.start);
  const end = start + Number(s.duration);
  const span = Math.max(1, end - start);
  const t0 = start - span * 0.05;
  const t1 = end + span * 0.08;
  const x = (t: number) => pad + ((t - t0) / (t1 - t0)) * (W - pad * 2);
  const total = Number(s.total) || 1;
  const y = (v: number) => H - pad - (v / total) * (H - pad * 2);
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = t0 + ((t1 - t0) * i) / 120;
    pts.push(`${x(t).toFixed(1)},${y(Number(vestedAt(s, t))).toFixed(1)}`);
  }
  const nowX = x(Math.min(Math.max(now, t0), t1));
  const vestedNow = Number(vestedAt(s, now));
  const claimed = Number(s.claimed ?? 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Vesting curve">
      <defs>
        <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1f7a8c" stopOpacity="0.28" />
          <stop offset="1" stopColor="#1f7a8c" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad} x2={W - pad} y1={y(total * f)} y2={y(total * f)} stroke="#efebe3" />
      ))}
      <polygon points={`${pad},${H - pad} ${pts.join(" ")} ${W - pad},${H - pad}`} fill="url(#fill)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#0f4c5c" strokeWidth="2.5" />
      {Number(s.cliff) > 0 && (
        <>
          <line x1={x(start + Number(s.cliff))} x2={x(start + Number(s.cliff))} y1={pad} y2={H - pad} stroke="#e36414" strokeDasharray="4 4" />
          <text x={x(start + Number(s.cliff)) + 5} y={pad + 10} fontSize="11" fill="#e36414">cliff</text>
        </>
      )}
      {claimed > 0 && <rect x={pad} y={y(claimed)} width={nowX - pad} height={H - pad - y(claimed)} fill="#e36414" opacity="0.12" />}
      <line x1={nowX} x2={nowX} y1={pad - 6} y2={H - pad} stroke="#12232a" strokeWidth="1.5" />
      <circle cx={nowX} cy={y(vestedNow)} r="5" fill="#e36414" stroke="#fff" strokeWidth="2" />
      <text x={nowX + 6} y={pad - 8} fontSize="11" fill="#12232a" fontWeight="700">
        {s.revoked ? "revoked" : "today"}
      </text>
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="#cfc9bd" />
    </svg>
  );
}
